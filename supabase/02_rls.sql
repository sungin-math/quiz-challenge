-- 02_rls.sql — RLS 활성화 · anon 권한 회수 · 선생님 전용 정책
--
-- 이 파일의 목적: anon(로그인하지 않은 학생) 이 테이블에 직접 손대지 못하게 만든다.
-- 학생 화면은 03_functions.sql 의 RPC 4개만 호출한다.

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
