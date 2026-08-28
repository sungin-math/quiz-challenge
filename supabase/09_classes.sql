-- 09_classes.sql — 반을 목록으로 관리하고, 학생은 그 목록에서 고른다
--
-- 01~08 을 실행한 프로젝트에 그대로 덧씌운다. 여러 번 실행해도 안전하다.
--
-- 바뀌는 점
--   · classes 테이블이 생긴다. 선생님이 /teacher/classes 에서 만든다.
--   · students.class_name(자유 입력 텍스트) → class_id(참조) 로 바뀐다.
--     오타로 "목요일A반" 과 "목요일 A반" 이 갈라지던 문제가 없어지고, 이름을 한 번 고치면
--     그 반 학생 전부에게 반영된다.
--   · 학년은 표가 아니라 화면의 고정 목록(고1·고2·고3)으로 고른다.
--     DB 는 계속 text 다 — 나중에 중3 을 넣더라도 src/lib/types.ts 의 GRADES 만 고치면 된다.

set search_path = public, extensions;

-- ── 1. 반 ───────────────────────────────────────────────────────────────
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint classes_name_len check (char_length(btrim(name)) between 1 and 40)
);

-- 같은 이름의 반이 둘이면 드롭다운에서 고를 수 없다.
create unique index if not exists classes_name_key
  on public.classes (lower(btrim(name)));

drop trigger if exists classes_touch_updated_at on public.classes;
create trigger classes_touch_updated_at
  before update on public.classes
  for each row execute function public.touch_updated_at();

alter table public.classes enable row level security;
revoke all on public.classes from anon;

drop policy if exists classes_teacher_all on public.classes;
create policy classes_teacher_all on public.classes
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- 정책이 있어도 테이블 권한이 없으면 읽지 못한다. 명시해 둔다.
grant select, insert, update, delete on public.classes to authenticated;

-- ── 2. 학생을 반에 붙인다 ───────────────────────────────────────────────
-- 반을 지우면 그 반 학생은 "반 없음" 이 된다. 학생과 제출 기록은 그대로 남는다.
alter table public.students
  add column if not exists class_id uuid references public.classes(id) on delete set null;

create index if not exists students_class_idx on public.students (class_id);

-- 예전에 자유 입력으로 적어 둔 반 이름을 classes 로 옮긴다.
do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'students'
                and column_name = 'class_name') then

    insert into public.classes (name, order_index)
    select btrim(st.class_name), 0
      from public.students st
     where btrim(st.class_name) <> ''
     group by btrim(st.class_name)
        on conflict do nothing;

    update public.students st
       set class_id = c.id
      from public.classes c
     where st.class_id is null
       and lower(btrim(st.class_name)) = lower(btrim(c.name));
  end if;
end $mig$;

-- ── 3. 뷰를 먼저 지운다 (class_name 컬럼을 참조하고 있다) ───────────────
drop view if exists public.teacher_student_stats;
drop view if exists public.teacher_student_season_stats;

alter table public.students drop column if exists class_name;

-- class_name 이 빠졌으므로 길이 제약을 다시 만든다.
alter table public.students drop constraint if exists students_profile_len;
alter table public.students add constraint students_profile_len check (
  char_length(school) <= 40 and char_length(grade) <= 20
);

-- ── 4. 권한 ─────────────────────────────────────────────────────────────
-- 08 과 같은 이유로 컬럼 단위다. password_hash 는 선생님도 읽을 수 없다.
revoke all on public.students from anon, authenticated;
grant select (id, name, school, grade, class_id, is_active, created_at, last_seen_at)
  on public.students to authenticated;
grant update (name, school, grade, class_id, is_active)
  on public.students to authenticated;
grant delete on public.students to authenticated;

-- ── 5. 통계 뷰 다시 만들기 ──────────────────────────────────────────────
-- 화면이 쓰는 이름은 그대로 class_name 이다. 이제 classes 에서 끌어온다.
create view public.teacher_student_stats with (security_invoker = true) as
select s.id as student_id, s.name, s.school, s.grade,
       s.class_id, coalesce(c.name, '') as class_name,
       s.is_active, s.created_at, s.last_seen_at,
       count(sub.id)::int as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int as solved_count
from public.students s
left join public.classes c       on c.id = s.class_id
left join public.submissions sub on sub.student_id = s.id
group by s.id, c.name;

create view public.teacher_student_season_stats with (security_invoker = true) as
select se.id as season_id,
       st.id as student_id,
       st.name, st.grade,
       st.class_id, coalesce(c.name, '') as class_name,
       count(sub.id)::int                                                 as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int  as solved_count,
       max(sub.created_at)                                                as last_submitted_at
from public.seasons se
cross join public.students st
left join public.classes c       on c.id = st.class_id
left join public.problems p      on p.season_id = se.id
left join public.submissions sub on sub.problem_id = p.id and sub.student_id = st.id
group by se.id, st.id, c.name;

revoke all on public.teacher_student_stats, public.teacher_student_season_stats from anon;
grant select on public.teacher_student_stats, public.teacher_student_season_stats to authenticated;

-- ── 6. 계정 생성 RPC 를 class_id 로 ─────────────────────────────────────
-- 인자 타입이 바뀌므로 create or replace 가 안 된다. 지우고 새로 만들면 권한도 함께 사라지므로
-- 아래에서 revoke/grant 를 다시 건다 (anon 을 명시하는 이유는 08 의 6번 주석 참고).
drop function if exists public.teacher_create_student(text, text, text, text, text);

create function public.teacher_create_student(
  p_name text, p_school text, p_grade text, p_class_id uuid, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $fn$
declare v_id uuid; v_name text;
begin
  if not public.is_teacher() then
    raise exception '권한이 없습니다. 관리자 계정으로 로그인해 주세요.';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception '이름은 1~20자로 입력해 주세요.';
  end if;
  if coalesce(p_password, '') !~ '^[0-9]{4}$' then
    raise exception '비밀번호는 숫자 4자리로 입력해 주세요.';
  end if;
  if exists (select 1 from public.students s where lower(btrim(s.name)) = lower(v_name)) then
    raise exception '이미 "%" 학생이 있습니다. 이름만으로 로그인하므로 구분되게 적어 주세요 (예: %(고1)).',
      v_name, v_name;
  end if;
  if p_class_id is not null and not exists (select 1 from public.classes c where c.id = p_class_id) then
    raise exception '반을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.';
  end if;

  insert into public.students (name, school, grade, class_id, password_hash)
  values (v_name,
          btrim(coalesce(p_school, '')),
          btrim(coalesce(p_grade, '')),
          p_class_id,
          crypt(p_password, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.teacher_create_student(text, text, text, uuid, text) from public, anon;
grant execute on function public.teacher_create_student(text, text, text, uuid, text) to authenticated;
