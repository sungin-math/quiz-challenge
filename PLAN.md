# 문제풀이 챌린지 — 확정 설계서

이 문서는 구현 전에 확정된 설계를 기록한 것입니다. 코드를 고치기 전에 여기부터 읽으세요.

---

## 1. 개요

선생님이 단답형 문제를 등록하고, 학생이 **선생님에게 미리 받은 계정(이름 + 숫자 4자리)** 으로 로그인해 문제를 풀면 즉시 자동 채점되는 웹앱입니다.

백엔드 서버 없이 **Vite + React 정적 SPA를 Netlify에 배포**하고, 데이터·인증·채점은 **Supabase**가 담당합니다.

> **핵심 보안 원칙: 정답 문자열은 절대 학생 브라우저로 전송되지 않는다.**
> 채점은 전부 Postgres 함수 안에서 일어나고, 브라우저는 `true`/`false`만 받습니다.

---

## 2. 확정 가정 (여기 없는 기능은 만들지 않는다)

| 항목 | 결정 |
| --- | --- |
| 회차 구분 | 시즌으로 구분. 문제는 시즌 하나에 속한다 |
| 학생 계정 | 선생님이 미리 만든다. 이름 · 학교 · 학년 · 반 · 초기 비밀번호(숫자 4자리) |
| 학년 | 고1 · 고2 · 고3 중에서 고른다. 화면의 고정 목록(`GRADES`)이고 표가 아니다 |
| 반 | `classes` 표로 관리한다. 선생님이 만들어 두고 학생은 그 목록에서 고른다 |
| 학생 로그인 | 이름 + 숫자 4자리. 자가 가입도, 비밀번호 자가 변경도 없다 |
| 동명이인 | **불가.** 이름이 곧 로그인 아이디이므로 유일해야 한다 |
| 오답 재시도 | 무제한. 단 분당 30회 속도 제한 |
| 리더보드 | 없음 |
| 문제 본문 | 텍스트 + LaTeX 수식(`$...$`) + 이미지 1장. 마크다운은 없음 |
| 선생님 | 1명. `teachers` 테이블에 SQL로 직접 등록 |

---

## 3. 핵심 설계 결정

1. **정답 보호 = Postgres RPC (`security definer`)**
   Netlify Functions나 Supabase Edge Function을 쓰지 않습니다. `service_role` 키를 어디에도 두지 않습니다.
2. **`anon` 역할은 테이블 직접 접근 권한이 전혀 없습니다.**
   학생 화면은 RPC 6개만 호출합니다: `student_login`, `student_profile`,
   `get_seasons_with_progress`, `get_problems_with_progress`, `get_problem`, `submit_answer`.
3. **학생 식별 = 로그인 후 localStorage에 저장한 `students.id` UUID.**
   저장하는 값은 `{id, name}` 뿐이고 비밀번호는 어디에도 남기지 않습니다.
   앱을 열 때 `student_profile` 로 그 계정이 아직 유효한지 한 번 확인합니다 —
   계정이 지워졌거나 사용 중지됐으면 세션을 버리고, 이름이 바뀌었으면 새 이름으로 갱신합니다.
4. **복수 정답 허용** (`answers text[]`).
   관리자 UI는 textarea 한 줄에 하나씩 입력받아 배열로 변환합니다.
5. **정규화 순서**: `normalize(NFKC)` → `btrim` → 연속 공백 1칸으로 축소 → `lower`
6. **관리자 판별** = `teachers` 테이블에 `auth.users.id`가 등록되어 있는지로 판단.
7. **스택**: Vite + React + TypeScript, react-router-dom v7, @supabase/supabase-js v2,
   Tailwind CSS v4 (`@tailwindcss/vite` 플러그인, config 파일 없이 `@import "tailwindcss";`).
   **전역 상태 라이브러리 없음.**
8. **수식 = KaTeX, DB 는 건드리지 않는다.**
   본문 text 안에 `$...$`(인라인) / `$$...$$`(블록) 로 적힌 LaTeX 를 브라우저가 렌더링할 뿐이다.
   수식 전용 컬럼도, 저장 형식 변환도 없다. 그래서 본문은 여전히 검색·수정이 쉬운 평범한 텍스트다.
   KaTeX 는 번들에 포함한다 (CDN 을 쓰지 않는다). 수식에 오타가 있으면 원문을 붉게 표시해
   선생님이 바로 알아채게 한다.
9. **그림 = 문제당 1장, Supabase Storage 의 public 버킷.**
   `problems.image_path` 에 파일 경로만 저장하고 주소는 화면에서 조립한다.
   학생은 로그인이 없으므로 읽기는 공개여야 한다. 파일 이름이 랜덤 UUID 라 주소를 모르면
   접근할 수 없고, 애초에 공개 문제의 본문 그림이므로 공개돼도 문제되지 않는다.
   **정답은 그림이 아니라 DB 에 있다는 원칙은 그대로다.** 업로드·삭제는 선생님만 가능하다.
10. **시즌 = 문제를 묶는 단위. 학생 정체성은 시즌과 무관하다.**
    문제는 시즌 하나에 속한다 (`problems.season_id`, `on delete cascade`).
    학생 계정은 하나뿐이고 시즌마다 따로 만들지 않는다. 진행률만 시즌별로 집계한다.
    **공개 판정은 두 단계다: 시즌이 공개이고 + 문제가 공개일 때만 학생에게 보인다.**
    조회(`get_problem`)뿐 아니라 채점(`submit_answer`)에서도 같은 조건을 건다 —
    조회만 막으면 주소를 아는 학생이 계속 답을 제출할 수 있기 때문이다.
11. **학생 계정 = 선생님이 미리 만들어 두는 `students` 행. 이름이 곧 아이디다.**
    로그인 입력이 이름 + 숫자 4자리뿐이므로 이름 하나가 학생 하나를 가리켜야 한다.
    그래서 `lower(btrim(name))` 에 유니크 인덱스를 걸고, 동명이인은 만들 수 없다
    (선생님이 `김민수(중2)` 처럼 구분해 적는다).
    - **비밀번호는 bcrypt 해시로만 저장한다.** 평문은 DB 에도 브라우저에도 남지 않는다.
      선생님 화면에서도 읽을 수 없다 — `password_hash` 는 컬럼 단위 권한에서 빠져 있어
      `select *` 를 하면 42501 이 난다. 4자리 비밀번호의 해시는 후보가 1만 개뿐이라
      새어 나가면 평문이나 마찬가지이기 때문이다. 잊어버리면 새로 정한다.
    - **계정 생성과 비밀번호 변경은 RPC 로만 한다** (`teacher_create_student`,
      `teacher_set_student_password`). 해시를 만드는 일이 서버 안에서 일어나야 하므로
      `students` 에 INSERT 권한 자체를 주지 않는다. 두 함수는 `security definer` 라
      RLS 를 우회하므로 함수 안에서 `is_teacher()` 를 직접 확인한다.
    - **로그인 실패는 예외가 아니라 `ok = false` 로 돌려준다.**
      `raise exception` 으로 알리면 "몇 번 틀렸는지" 를 적어 둔 UPDATE 까지 함께 롤백된다.
      10회 틀리면 5분 잠긴다 — 4자리는 경우의 수가 1만 개뿐이라 잠금이 없으면 다 해볼 수 있다.
      없는 이름과 틀린 비밀번호는 같은 문구로 답한다 (누가 등록돼 있는지 떠보지 못하게).
    - **사용 중지(`is_active = false`)는 조회뿐 아니라 채점도 막는다.** 8번·10번과 같은 이유다.
      기록을 남긴 채 로그인만 막고 싶을 때 쓰고, 삭제는 제출 기록까지 함께 지운다.
12. **반은 표(`classes`), 학년은 화면의 고정 목록.** 둘 다 자유 입력이 아니라 드롭다운이다.
    - **반을 표로 둔 이유**: 자유 입력이면 `목요일A반` 과 `목요일 A반` 이 갈라져 통계가 쪼개진다.
      `students.class_id` 로 참조하므로 이름을 한 번 고치면 그 반 학생 전부에게 반영된다.
      반을 지우면 `on delete set null` — 학생은 "반 없음" 이 되고 계정과 제출 기록은 남는다.
      (삭제 확인창에서 몇 명이 영향받는지 먼저 알려준다.)
    - **학년을 표로 두지 않은 이유**: 값이 세 개뿐이고 거의 바뀌지 않는다. 표로 만들면
      관리 화면이 하나 더 늘어날 뿐이다. `src/lib/types.ts` 의 `GRADES` 배열 하나가
      드롭다운과 붙여넣기 검증을 동시에 정한다 — 중3 을 넣고 싶으면 여기만 고친다.
      **DB 는 그대로 `text`** 라 체크 제약을 고치러 SQL 을 다시 실행할 일이 없다.
    - 통계 뷰는 `classes` 를 조인해 계속 `class_name` 이라는 이름으로 값을 내려 준다.
      화면 코드는 반이 표가 된 것을 모른다.

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

### `supabase/05_media.sql`

수식·이미지 지원을 위해 나중에 덧씌운 변경분. 01~04 를 이미 실행한 프로젝트에 그대로 실행한다.
여러 번 실행해도 안전하다. 수식은 DB 를 건드리지 않으므로 여기 있는 것은 이미지용뿐이다.

- `problems.image_path text` 컬럼 추가 (`add column if not exists`)
- `get_problem` 을 `drop` 후 재생성 — 반환 컬럼에 `image_path` 가 늘어 타입이 바뀌므로
  `create or replace` 로는 안 된다. **drop 하면 권한도 사라지므로 `grant execute` 를 다시 해준다.**
  `answers` 를 반환하지 않는다는 원칙은 그대로다.
- `problem-images` 버킷 생성 (`public = true`), 5MB · 이미지 MIME 만 허용하도록 버킷에 제한 설정
- `storage.objects` 에 정책 하나: 이 버킷에 대한 쓰기는 `public.is_teacher()` 인 계정만

### `supabase/06_seasons.sql`

문제를 시즌별로 묶기 위해 덧씌운 변경분. 01~05 를 실행한 프로젝트에 그대로 실행한다.

- `seasons` 테이블 (`name`, `is_published`, `order_index`) + RLS. 선생님만 읽고 쓴다.
- `problems.season_id` 추가 → **기존 문제를 '기본' 시즌으로 이관** → `set not null`.
  이관은 `do $$ ... $$` 블록 안에서 하며, 이미 옮겨진 상태면 아무 일도 하지 않는다.
- `get_seasons_with_progress(p_student_id)` 신규 — 시즌 목록 + 시즌별 진행률
- `get_problems_with_progress` 는 인자가 `(p_student_id, p_season_id)` 로 늘어 **drop 후 재생성**
- `get_problem` · `submit_answer` 에 시즌 공개 조건 추가
- `teacher_problem_stats` 뷰에 `season_id` · `season_name` 추가 (drop 후 재생성 + 재grant)

> 인자나 반환 타입이 바뀌는 함수는 `create or replace` 로 못 고친다. `drop` 이 필요하고,
> **drop 하면 실행 권한이 사라지므로 `grant execute` 를 반드시 다시 해준다.**

### `supabase/07_season_stats.sql`

선생님 통계 화면이 쓰는 뷰 2개. 01~06 을 실행한 프로젝트에 덧씌운다.

- `teacher_season_stats` — 시즌 한 줄에 문제 수(공개/전체) · 참여 학생 · 제출 수 · 정답 제출 수
- `teacher_student_season_stats` — 시즌 × 학생. **`students` 를 cross join 한다.**
  한 문제도 풀지 않은 학생이 0 으로 나와야 "누가 안 하고 있는지" 를 볼 수 있기 때문이다.

둘 다 `security_invoker = true` 다. RLS 를 우회하지 않고 호출한 사람 권한으로 읽으므로,
02_rls.sql 의 정책에 따라 선생님만 값을 볼 수 있다. anon 권한은 명시적으로 회수한다.

> `correct_count` 는 (학생, 문제) 쌍당 최대 1건이다 — 이미 맞힌 문제는 다시 기록하지 않으므로
> "맞힌 문제 수" 와 같은 값이다. 화면의 **정답률 = 정답 제출 ÷ 전체 제출** 이라,
> 오답을 여러 번 시도할수록 낮아진다. 난이도 지표로 읽으면 된다.

### `supabase/08_students.sql`

학생을 "아무 이름이나 적고 시작" 에서 **미리 만들어 둔 계정** 으로 바꾼다. 01~07 위에 덧씌운다.

- `students.nickname` → `name` 으로 바꾸고 `school` · `grade` · `class_name` ·
  `is_active` · `password_hash` · `failed_attempts` · `locked_until` 을 추가한다.
- `lower(btrim(name))` 유니크 인덱스 — 이름이 로그인 아이디다.
  **기존 데이터에 동명이인이 있으면 스크립트가 맨 앞에서 멈추고 무엇이 겹치는지 알려준다.**
- 학생용 `student_login` · `student_profile`, 선생님용 `teacher_create_student` ·
  `teacher_set_student_password` 를 만들고 `start_session` 은 지운다.
- `submit_answer` 는 `is_active` 까지 확인하도록 바꾼다 (시그니처가 그대로라 권한이 유지된다).
- `students` 권한을 컬럼 단위로 다시 준다 — 선생님도 `password_hash` 는 읽을 수 없고,
  INSERT 권한은 아무에게도 없다.
- `teacher_student_stats` · `teacher_student_season_stats` 를 새 컬럼에 맞춰 다시 만든다.

> **계정 방식 이전부터 있던 학생** 에게는 알 수 없는 해시가 들어간다(숫자 4자리가 아니라
> 어떤 입력으로도 로그인되지 않는다). 선생님이 비밀번호를 새로 정해 줘야 쓸 수 있다.

> `crypt()` 는 pgcrypto 가 `public` 에 있든 `extensions` 에 있든 찾을 수 있어야 하므로,
> 스크립트와 비밀번호를 다루는 함수 모두 `search_path` 에 두 스키마를 넣는다.

### `supabase/09_classes.sql`

반을 자유 입력 텍스트에서 표로 바꾼다. 01~08 위에 덧씌운다.

- `classes` 테이블 (`name` 유니크, `order_index`) + 선생님 전용 RLS.
- `students.class_name` → `class_id uuid references classes(id) on delete set null`.
  기존에 적어 둔 반 이름은 `classes` 로 옮기고 참조를 이어 준다.
- `teacher_create_student` 의 인자가 `p_class_name text` → `p_class_id uuid` 로 바뀐다.
  **인자 타입이 바뀌면 `create or replace` 가 안 되므로 지우고 새로 만든다 — 권한도 함께
  사라지니 `revoke`/`grant` 를 다시 건다** (`anon` 을 명시하는 이유는 08 의 6번 주석 참고).
- `teacher_student_stats` · `teacher_student_season_stats` 를 다시 만든다.
  `classes` 를 조인해 `class_name` 이라는 같은 이름으로 값을 내려 주므로 화면 코드는 그대로다.

> **컬럼을 지우기 전에 뷰를 먼저 지운다.** 두 뷰가 `class_name` 을 참조하고 있어서
> 순서를 바꾸면 `drop column` 이 거절된다.

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
supabase/01_schema.sql  02_rls.sql  03_functions.sql  04_seed.sql  05_media.sql  06_seasons.sql  07_season_stats.sql  08_students.sql  09_classes.sql
src/
  main.tsx              # createRoot + BrowserRouter
  App.tsx               # 라우트 정의만
  index.css             # @import "tailwindcss";
  vite-env.d.ts         # ImportMetaEnv 타입 선언
  lib/
    supabase.ts         # createClient 싱글턴. env 누락 시 명확한 한국어 에러 throw
    types.ts            # Problem, ProblemSummary, ProgressRow, SubmitResult, Student, SchoolClass, StudentStats, ProblemStats
                        #  + GRADES (학년 드롭다운 목록. 여기만 고치면 선택지가 바뀐다)
    session.ts          # localStorage 키 "quiz.student" 에 {id, name} 저장. get/set/clear + useStudent 훅
    errors.ts           # Supabase PostgrestError → 사용자용 한국어 메시지 변환
    images.ts           # 문제 그림 업로드·삭제·공개 URL (Supabase Storage)
  components/
    Layout.tsx          # 공통 헤더/컨테이너
    MathText.tsx        # 본문 속 $...$ 를 KaTeX 로 렌더링
    RequireStudent.tsx  # 세션 없으면 "/" 로 리다이렉트. 앱을 열 때 student_profile 로 계정 유효성 1회 확인
    RequireTeacher.tsx  # Auth 세션 + teachers 본인 행 확인, 실패 시 /teacher/login
  pages/
    StudentStart.tsx        "/"                      이름 + 숫자 4자리 → student_login. 로그인돼 있으면 "이어서 풀기"
    SeasonList.tsx          "/seasons"               get_seasons_with_progress. 시즌별 진행률
    ProblemList.tsx         "/seasons/:seasonId"     get_problems_with_progress. 그 시즌의 문제만
    ProblemSolve.tsx        "/problems/:id"          get_problem + submit_answer. 정답/오답 즉시 피드백
    MyProgress.tsx          "/me"                    맞춘 수/전체, 시즌별 진행률, 로그아웃
    TeacherLogin.tsx        "/teacher/login"         signInWithPassword
    TeacherSeasons.tsx      "/teacher/seasons"       시즌 생성·이름수정·공개토글·삭제
    TeacherStudents.tsx     "/teacher/students"      학생 계정 생성(한 명/여러 명)·정보 수정·비밀번호 재설정·사용중지·삭제
    TeacherClasses.tsx      "/teacher/classes"       반 생성·이름수정·순서변경·삭제
    TeacherProblems.tsx     "/teacher"               목록·공개토글·삭제. ?season= 로 시즌 필터
    TeacherProblemEdit.tsx  "/teacher/problems/:id"  :id === "new" 면 등록, 아니면 수정
    TeacherStats.tsx        "/teacher/stats"         시즌 요약 + 시즌 필터가 걸리는 문제별·학생별 표
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
