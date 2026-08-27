-- 07_season_stats.sql — 시즌별 통계 뷰 2개
--
-- 01~06 을 실행한 프로젝트에 그대로 덧씌운다. 여러 번 실행해도 안전하다.
--
-- 두 뷰 모두 security_invoker = true 다. 즉 RLS 를 우회하지 않고 호출한 사람의 권한으로 읽는다.
-- 02_rls.sql 의 정책상 선생님 계정만 problems·students·submissions 를 볼 수 있으므로,
-- anon 이 이 뷰를 조회해도 아무것도 나오지 않는다. 아래에서 anon 권한도 명시적으로 회수한다.

-- ── 1. 시즌 요약 ────────────────────────────────────────────────────────
-- 시즌 한 줄에 문제 수 · 참여 학생 수 · 제출 수 · 정답 제출 수.
-- correct_count 는 (학생, 문제) 쌍당 최대 1건이다 — 이미 맞힌 문제는 다시 기록하지 않기 때문에
-- "맞힌 문제 수" 와 같은 값이다.
create or replace view public.teacher_season_stats with (security_invoker = true) as
select se.id          as season_id,
       se.name,
       se.is_published,
       se.order_index,
       count(distinct p.id)::int                                as problem_count,
       count(distinct p.id) filter (where p.is_published)::int  as published_problem_count,
       count(distinct sub.student_id)::int                      as participant_count,
       count(sub.id)::int                                       as attempt_count,
       count(sub.id) filter (where sub.is_correct)::int         as correct_count
from public.seasons se
left join public.problems p    on p.season_id = se.id
left join public.submissions sub on sub.problem_id = p.id
group by se.id;

-- ── 2. 시즌 × 학생 ──────────────────────────────────────────────────────
-- 아직 한 문제도 풀지 않은 학생도 0 으로 나와야 "누가 안 하고 있는지" 를 볼 수 있다.
-- 그래서 students 를 cross join 한다. 학생 수 × 시즌 수 만큼의 행이 나오지만
-- 한 반 규모에서는 문제가 되지 않는다.
create or replace view public.teacher_student_season_stats with (security_invoker = true) as
select se.id as season_id,
       st.id as student_id,
       st.nickname,
       count(sub.id)::int                                              as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int as solved_count,
       max(sub.created_at)                                             as last_submitted_at
from public.seasons se
cross join public.students st
left join public.problems p      on p.season_id = se.id
left join public.submissions sub on sub.problem_id = p.id and sub.student_id = st.id
group by se.id, st.id;

-- ── 3. 권한 ─────────────────────────────────────────────────────────────
revoke all on public.teacher_season_stats, public.teacher_student_season_stats from anon;
grant select on public.teacher_season_stats, public.teacher_student_season_stats to authenticated;
