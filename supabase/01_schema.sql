-- 01_schema.sql — 테이블 · 인덱스 · 트리거 · 관리자용 통계 뷰
-- Supabase SQL Editor 에서 01 → 02 → 03 → 04 순서로 실행하세요.

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

-- 한 학생이 한 문제를 맞힌 기록은 최대 1건. 중복 정답 제출을 DB 차원에서 막는다.
create unique index submissions_one_correct_per_pair
  on public.submissions (student_id, problem_id) where is_correct;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger problems_touch_updated_at
  before update on public.problems
  for each row execute function public.touch_updated_at();

-- security_invoker = true : 뷰를 조회하는 사람의 권한으로 평가된다.
-- 즉 RLS 를 우회하지 않으므로, 선생님만 볼 수 있다.
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
