# 문제풀이 챌린지 — 확정 설계서

이 문서는 구현 전에 확정된 설계를 기록한 것입니다. 코드를 고치기 전에 여기부터 읽으세요.

---

## 1. 개요

선생님이 단답형 문제를 등록하고, 학생이 링크로 들어와 **로그인 없이 이름만 입력**해 문제를 풀면 즉시 자동 채점되는 웹앱입니다.

백엔드 서버 없이 **Vite + React 정적 SPA를 Netlify에 배포**하고, 데이터·인증·채점은 **Supabase**가 담당합니다.

> **핵심 보안 원칙: 정답 문자열은 절대 학생 브라우저로 전송되지 않는다.**
> 채점은 전부 Postgres 함수 안에서 일어나고, 브라우저는 `true`/`false`만 받습니다.

---

## 2. 확정 가정 (여기 없는 기능은 만들지 않는다)

| 항목 | 결정 |
| --- | --- |
| 반 / 회차 구분 | 없음 |
| 동명이인 | 허용 (이름은 식별자가 아님) |
| 오답 재시도 | 무제한. 단 분당 30회 속도 제한 |
| 리더보드 | 없음 |
| 문제 본문 | 순수 텍스트 (마크다운·이미지·수식 없음) |
| 선생님 | 1명. `teachers` 테이블에 SQL로 직접 등록 |

---

## 3. 핵심 설계 결정

1. **정답 보호 = Postgres RPC (`security definer`)**
   Netlify Functions나 Supabase Edge Function을 쓰지 않습니다. `service_role` 키를 어디에도 두지 않습니다.
2. **`anon` 역할은 테이블 직접 접근 권한이 전혀 없습니다.**
   학생 화면은 RPC 4개만 호출합니다: `start_session`, `get_problems_with_progress`, `get_problem`, `submit_answer`.
3. **학생 식별 = localStorage에 저장한 `students.id` UUID.**
   기기를 바꾸거나 브라우저 저장소를 지우면 이어서 풀 수 있도록 시작 화면에 "이어하기 코드"(= 그 UUID) 입력란을 둡니다.
4. **복수 정답 허용** (`answers text[]`).
   관리자 UI는 textarea 한 줄에 하나씩 입력받아 배열로 변환합니다.
5. **정규화 순서**: `normalize(NFKC)` → `btrim` → 연속 공백 1칸으로 축소 → `lower`
6. **관리자 판별** = `teachers` 테이블에 `auth.users.id`가 등록되어 있는지로 판단.
7. **스택**: Vite + React + TypeScript, react-router-dom v7, @supabase/supabase-js v2,
   Tailwind CSS v4 (`@tailwindcss/vite` 플러그인, config 파일 없이 `@import "tailwindcss";`).
   **전역 상태 라이브러리 없음.**

---

## 4. 데이터베이스

### `supabase/01_schema.sql`

```sql
create extension if not exists pgcrypto;

create table public.teachers (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create table public.problems (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null default '',
  answers      text[] not null,
  is_published boolean not null default false,
  order_index  integer not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint problems_title_len   check (char_length(btrim(title)) between 1 and 200),
  constraint problems_answers_len check (coalesce(array_length(answers, 1), 0) between 1 and 20)
);
create index problems_published_idx on public.problems (is_published, order_index, created_at);

create table public.students (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint students_nickname_len check (char_length(btrim(nickname)) between 1 and 20)
);

create table public.submissions (
  id               bigint generated always as identity primary key,
  student_id       uuid not null references public.students(id) on delete cascade,
  problem_id       uuid not null references public.problems(id) on delete cascade,
  submitted_answer text not null,
  is_correct       boolean not null,
  created_at       timestamptz not null default now()
);
create index submissions_student_idx on public.submissions (student_id, created_at desc);
create index submissions_problem_idx on public.submissions (problem_id);
create unique index submissions_one_correct_per_pair
  on public.submissions (student_id, problem_id) where is_correct;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger problems_touch_updated_at
  before update on public.problems
  for each row execute function public.touch_updated_at();

create view public.teacher_student_stats with (security_invoker = true) as
select s.id as student_id, s.nickname, s.created_at, s.last_seen_at,
       count(sub.id)::int as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int as solved_count
from public.students s
left join public.submissions sub on sub.student_id = s.id
group by s.id;

create view public.teacher_problem_stats with (security_invoker = true) as
select p.id as problem_id, p.title, p.is_published, p.order_index,
       count(sub.id)::int as total_attempts,
       count(distinct sub.student_id)::int as attempted_students,
       count(distinct sub.student_id) filter (where sub.is_correct)::int as solved_students
from public.problems p
left join public.submissions sub on sub.problem_id = p.id
group by p.id;
```

### `supabase/02_rls.sql`

```sql
alter table public.teachers    enable row level security;
alter table public.problems    enable row level security;
alter table public.students    enable row level security;
alter table public.submissions enable row level security;

revoke all on public.teachers, public.problems, public.students, public.submissions from anon;
revoke all on public.teacher_student_stats, public.teacher_problem_stats from anon;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t where t.id = auth.uid())
$$;

create policy teachers_select_self on public.teachers
  for select to authenticated using (id = auth.uid());

create policy problems_teacher_all on public.problems
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create policy students_teacher_select on public.students
  for select to authenticated using (public.is_teacher());
create policy submissions_teacher_select on public.submissions
  for select to authenticated using (public.is_teacher());

grant select on public.teacher_student_stats, public.teacher_problem_stats to authenticated;
```

### `supabase/03_functions.sql`

```sql
create or replace function public.normalize_answer(txt text)
returns text language sql immutable strict as $$
  select lower(regexp_replace(btrim(normalize(txt, NFKC)), '\s+', ' ', 'g'))
$$;

create or replace function public.start_session(p_nickname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nick text;
begin
  v_nick := btrim(coalesce(p_nickname, ''));
  if char_length(v_nick) < 1 or char_length(v_nick) > 20 then
    raise exception '이름은 1~20자로 입력해 주세요.';
  end if;
  insert into students(nickname) values (v_nick) returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_problems_with_progress(p_student_id uuid)
returns table (problem_id uuid, title text, order_index int, solved boolean, attempts int)
language sql security definer stable set search_path = public as $$
  select p.id, p.title, p.order_index,
         coalesce(bool_or(s.is_correct), false),
         count(s.id)::int
  from problems p
  left join submissions s on s.problem_id = p.id and s.student_id = p_student_id
  where p.is_published
  group by p.id, p.title, p.order_index, p.created_at
  order by p.order_index, p.created_at
$$;

create or replace function public.get_problem(p_problem_id uuid)
returns table (problem_id uuid, title text, body text)
language sql security definer stable set search_path = public as $$
  select p.id, p.title, p.body
  from problems p
  where p.id = p_problem_id and p.is_published
$$;

create or replace function public.submit_answer(
  p_student_id uuid, p_problem_id uuid, p_answer text)
returns table (is_correct boolean, already_solved boolean)
language plpgsql security definer set search_path = public as $$
declare v_answers text[]; v_correct boolean; v_already boolean; v_recent int;
begin
  if p_answer is null or btrim(p_answer) = '' or char_length(p_answer) > 500 then
    raise exception '답안이 비었거나 너무 깁니다.';
  end if;
  if not exists (select 1 from students where id = p_student_id) then
    raise exception '세션이 유효하지 않습니다. 다시 시작해 주세요.';
  end if;

  select count(*) into v_recent from submissions
   where student_id = p_student_id and created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception '너무 빠르게 제출했습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  select answers into v_answers from problems
   where id = p_problem_id and is_published;
  if v_answers is null then raise exception '문제를 찾을 수 없습니다.'; end if;

  select exists (select 1 from submissions sub
                  where sub.student_id = p_student_id
                    and sub.problem_id = p_problem_id
                    and sub.is_correct)
    into v_already;

  select exists (select 1 from unnest(v_answers) a
                  where normalize_answer(a) = normalize_answer(p_answer))
    into v_correct;

  if not v_already then
    insert into submissions(student_id, problem_id, submitted_answer, is_correct)
    values (p_student_id, p_problem_id, left(p_answer, 500), v_correct);
  end if;

  update students set last_seen_at = now() where id = p_student_id;
  return query select v_correct, v_already;
end $$;

revoke all on function public.start_session(text),
                       public.get_problems_with_progress(uuid),
                       public.get_problem(uuid),
                       public.submit_answer(uuid, uuid, text) from public;
grant execute on function public.start_session(text),
                          public.get_problems_with_progress(uuid),
                          public.get_problem(uuid),
                          public.submit_answer(uuid, uuid, text) to anon, authenticated;
```

### `supabase/04_seed.sql`

- 맨 위 주석으로 `<USER_UID>` / `<EMAIL>` 을 Supabase Authentication → Users 에서 만든 선생님 계정 값으로 바꾸라고 안내
- `insert into public.teachers(id, email) values ('<USER_UID>', '<EMAIL>');`
- 샘플 문제 3개 insert (복수 정답 예시 포함, 2개는 `is_published = true`, 1개는 `false`)

---

## 5. 폴더 구조 (이대로. 더 만들지 않는다)

```
.gitignore              # node_modules, dist, .env.local, .env
.env.example            # VITE_SUPABASE_URL=, VITE_SUPABASE_ANON_KEY= (값 없음)
index.html
netlify.toml
package.json
tsconfig.json
tsconfig.node.json
vite.config.ts
README.md
PLAN.md
supabase/01_schema.sql  02_rls.sql  03_functions.sql  04_seed.sql
src/
  main.tsx              # createRoot + BrowserRouter
  App.tsx               # 라우트 정의만
  index.css             # @import "tailwindcss";
  vite-env.d.ts         # ImportMetaEnv 타입 선언
  lib/
    supabase.ts         # createClient 싱글턴. env 누락 시 명확한 한국어 에러 throw
    types.ts            # Problem, ProblemSummary, ProgressRow, SubmitResult, StudentStats, ProblemStats
    session.ts          # localStorage 키 "quiz.student" 에 {id, nickname} 저장. get/set/clear + useStudent 훅
    errors.ts           # Supabase PostgrestError → 사용자용 한국어 메시지 변환
  components/
    Layout.tsx          # 공통 헤더/컨테이너
    RequireStudent.tsx  # 세션 없으면 "/" 로 리다이렉트
    RequireTeacher.tsx  # Auth 세션 + teachers 본인 행 확인, 실패 시 /teacher/login
  pages/
    StudentStart.tsx        "/"                      이름 입력 → start_session. 기존 세션 있으면 "이어서 풀기". 이어하기 코드 입력란
    ProblemList.tsx         "/problems"              get_problems_with_progress. 푼 문제 체크 표시
    ProblemSolve.tsx        "/problems/:id"          get_problem + submit_answer. 정답/오답 즉시 피드백
    MyProgress.tsx          "/me"                    맞춘 수/전체, 이어하기 코드 표시(복사 버튼)
    TeacherLogin.tsx        "/teacher/login"         signInWithPassword
    TeacherProblems.tsx     "/teacher"               목록·공개토글·삭제
    TeacherProblemEdit.tsx  "/teacher/problems/:id"  :id === "new" 면 등록, 아니면 수정
    TeacherStats.tsx        "/teacher/stats"         teacher_student_stats + teacher_problem_stats 조회
```

---

## 6. `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

SPA이므로 `/problems/:id` 같은 경로를 직접 열어도 `index.html`로 폴백해야 합니다.

---

## 7. 환경변수

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` **두 개만** 사용합니다.

`service_role` 키는 절대 쓰지 않습니다. `VITE_` 접두사가 붙은 값은 빌드 결과물에 그대로 포함되어 누구나 볼 수 있습니다. `anon` 키는 공개되어도 안전하도록 RLS와 RPC 권한이 설계되어 있습니다.

---

## 8. 구현 시 지켜야 할 것

- **`already_solved === true`이면 "이미 맞힌 문제입니다"로 표시하고, 재채점 결과로 상태를 덮어쓰지 않는다.**
- 관리자 문제 편집 화면에 안내 문구를 넣는다:
  > 정답은 한 줄에 하나씩. 대소문자와 앞뒤 공백은 무시되지만 '10'과 '십'은 다르게 처리되니 표기 변형을 모두 적어주세요.
- 학생 화면 어디에서도 `supabase.from('problems')` 를 호출하지 않는다. **오직 RPC만.**
- 로딩 · 에러 · 빈 상태를 각 화면에서 모두 처리한다.
- UI는 Tailwind로, 모바일에서 쓸 수 있게 반응형으로, 전부 한국어로.
