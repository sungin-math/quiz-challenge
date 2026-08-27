-- 06_seasons.sql — 문제를 시즌(회차)별로 묶는다
--
-- 01~05 를 실행한 프로젝트에 그대로 덧씌운다. 여러 번 실행해도 안전하다.
--
-- 학생은 시즌 목록에서 하나를 골라 그 시즌의 문제만 푼다.
-- 이름과 이어하기 코드는 시즌과 무관하게 하나로 유지된다 (students 테이블은 건드리지 않는다).
-- 시즌이 비공개면 그 안의 문제는 공개 상태와 무관하게 학생에게 보이지 않는다.

-- ── 1. 시즌 테이블 ──────────────────────────────────────────────────────
create table if not exists public.seasons (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_published boolean not null default false,
  order_index  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint seasons_name_len check (char_length(btrim(name)) between 1 and 60)
);

drop trigger if exists seasons_touch_updated_at on public.seasons;
create trigger seasons_touch_updated_at
  before update on public.seasons
  for each row execute function public.touch_updated_at();

alter table public.seasons enable row level security;
revoke all on public.seasons from anon;

drop policy if exists seasons_teacher_all on public.seasons;
create policy seasons_teacher_all on public.seasons
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- ── 2. 문제에 시즌 붙이기 ───────────────────────────────────────────────
alter table public.problems
  add column if not exists season_id uuid references public.seasons(id) on delete cascade;

-- 이미 있던 문제들을 '기본' 시즌으로 옮긴다. 학생들의 제출 기록은 그대로 유지된다.
do $$
declare v_season_id uuid;
begin
  if exists (select 1 from public.problems where season_id is null) then
    select id into v_season_id from public.seasons where name = '기본' limit 1;
    if v_season_id is null then
      insert into public.seasons (name, is_published, order_index)
      values ('기본', true, 0)
      returning id into v_season_id;
    end if;
    update public.problems set season_id = v_season_id where season_id is null;
  end if;
end $$;

-- 이관이 끝났으니 앞으로는 시즌 없는 문제를 만들 수 없게 한다.
alter table public.problems alter column season_id set not null;

create index if not exists problems_season_idx
  on public.problems (season_id, is_published, order_index, created_at);

-- ── 3. 학생용 RPC ───────────────────────────────────────────────────────

-- 시즌 목록. 각 시즌의 문제 수와 그 학생이 맞힌 수를 함께 준다.
create or replace function public.get_seasons_with_progress(p_student_id uuid)
returns table (season_id uuid, name text, order_index int, total_problems int, solved_count int)
language sql security definer stable set search_path = public as $$
  select s.id,
         s.name,
         s.order_index,
         count(distinct p.id)::int,
         count(distinct p.id) filter (where sub.is_correct)::int
  from seasons s
  left join problems p
         on p.season_id = s.id and p.is_published
  left join submissions sub
         on sub.problem_id = p.id and sub.student_id = p_student_id and sub.is_correct
  where s.is_published
  group by s.id, s.name, s.order_index, s.created_at
  order by s.order_index, s.created_at
$$;

revoke all on function public.get_seasons_with_progress(uuid) from public;
grant execute on function public.get_seasons_with_progress(uuid) to anon, authenticated;

-- 시즌 하나의 문제 목록. 인자가 늘어 타입이 바뀌므로 옛 함수를 지우고 새로 만든다.
drop function if exists public.get_problems_with_progress(uuid);

create function public.get_problems_with_progress(p_student_id uuid, p_season_id uuid)
returns table (problem_id uuid, title text, order_index int, solved boolean, attempts int)
language sql security definer stable set search_path = public as $$
  select p.id, p.title, p.order_index,
         coalesce(bool_or(s.is_correct), false),
         count(s.id)::int
  from problems p
  join seasons se on se.id = p.season_id
  left join submissions s on s.problem_id = p.id and s.student_id = p_student_id
  where p.is_published and se.is_published and p.season_id = p_season_id
  group by p.id, p.title, p.order_index, p.created_at
  order by p.order_index, p.created_at
$$;

revoke all on function public.get_problems_with_progress(uuid, uuid) from public;
grant execute on function public.get_problems_with_progress(uuid, uuid) to anon, authenticated;

-- 문제 하나. 시즌이 비공개면 문제도 보이지 않는다.
drop function if exists public.get_problem(uuid);

create function public.get_problem(p_problem_id uuid)
returns table (problem_id uuid, title text, body text, image_path text, season_id uuid, season_name text)
language sql security definer stable set search_path = public as $$
  select p.id, p.title, p.body, p.image_path, s.id, s.name
  from problems p
  join seasons s on s.id = p.season_id
  where p.id = p_problem_id and p.is_published and s.is_published
$$;

revoke all on function public.get_problem(uuid) from public;
grant execute on function public.get_problem(uuid) to anon, authenticated;

-- 채점도 같은 기준으로 막는다. 조회만 막고 채점을 열어두면 주소를 아는 학생이 계속 풀 수 있다.
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

  -- 속도 제한: 최근 1분간 30회까지
  select count(*) into v_recent from submissions
   where student_id = p_student_id and created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception '너무 빠르게 제출했습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  select p.answers into v_answers
    from problems p
    join seasons s on s.id = p.season_id
   where p.id = p_problem_id and p.is_published and s.is_published;
  if v_answers is null then raise exception '문제를 찾을 수 없습니다.'; end if;

  select exists (select 1 from submissions sub
                  where sub.student_id = p_student_id
                    and sub.problem_id = p_problem_id
                    and sub.is_correct)
    into v_already;

  select exists (select 1 from unnest(v_answers) a
                  where normalize_answer(a) = normalize_answer(p_answer))
    into v_correct;

  -- 이미 맞힌 문제는 기록을 남기지 않는다 (정답 유니크 인덱스와도 충돌하지 않음).
  if not v_already then
    insert into submissions(student_id, problem_id, submitted_answer, is_correct)
    values (p_student_id, p_problem_id, left(p_answer, 500), v_correct);
  end if;

  update students set last_seen_at = now() where id = p_student_id;
  return query select v_correct, v_already;
end $$;

revoke all on function public.submit_answer(uuid, uuid, text) from public;
grant execute on function public.submit_answer(uuid, uuid, text) to anon, authenticated;

-- ── 4. 선생님 통계 뷰에 시즌 이름 추가 ──────────────────────────────────
drop view if exists public.teacher_problem_stats;

create view public.teacher_problem_stats with (security_invoker = true) as
select p.id as problem_id, p.title, p.is_published, p.order_index,
       p.season_id, se.name as season_name,
       count(sub.id)::int as total_attempts,
       count(distinct sub.student_id)::int as attempted_students,
       count(distinct sub.student_id) filter (where sub.is_correct)::int as solved_students
from public.problems p
join public.seasons se on se.id = p.season_id
left join public.submissions sub on sub.problem_id = p.id
group by p.id, se.name;

revoke all on public.teacher_problem_stats from anon;
grant select on public.teacher_problem_stats to authenticated;
