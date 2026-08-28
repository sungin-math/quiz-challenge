-- 08_students.sql — 학생 계정을 미리 만들어 두고 이름 + 4자리 비밀번호로 로그인
--
-- 01~07 을 실행한 프로젝트에 그대로 덧씌운다. 여러 번 실행해도 안전하다.
--
-- 바뀌는 점
--   · 학생이 아무 이름이나 적고 시작하던 방식(start_session)과 "이어하기 코드"는 없어진다.
--   · 선생님이 학생 계정을 만들어 두고, 학생은 이름 + 숫자 4자리로 로그인한다.
--   · students.nickname → name 으로 이름을 바꾸고 school / grade / class_name 을 추가한다.
--
-- 비밀번호는 bcrypt 해시로만 저장한다. 평문은 어디에도 남지 않고,
-- 선생님 화면에서도 읽을 수 없다(아래 6번 컬럼 단위 권한). 잊어버리면 새로 설정한다.

-- pgcrypto 가 public 에 있든 extensions 에 있든 crypt() 를 찾을 수 있어야 한다.
-- Supabase 는 보통 extensions 스키마에 미리 깔아 두지만 프로젝트마다 다를 수 있으므로
-- 이 스크립트도, 비밀번호를 다루는 함수도 search_path 에 두 스키마를 모두 둔다.
set search_path = public, extensions;
create extension if not exists pgcrypto;

-- ── 1. 이름이 겹치면 로그인할 수 없다 ───────────────────────────────────
-- 로그인 입력값이 이름 + 비밀번호뿐이므로 이름 하나가 학생 하나를 가리켜야 한다.
-- 기존 데이터에 동명이인이 있으면 여기서 멈추고 무엇이 겹치는지 알려준다.
do $mig$
declare v_dup text;
begin
  select string_agg(n, ', ') into v_dup
  from (select lower(btrim(nickname)) as n
          from public.students
         group by 1 having count(*) > 1) d;
  if v_dup is not null then
    raise exception '이름이 겹치는 학생이 있어 멈췄습니다: % — 먼저 중복된 학생을 지우거나 이름을 구분한 뒤 다시 실행해 주세요.', v_dup;
  end if;
exception
  when undefined_column then null;  -- 이미 name 으로 바꾼 뒤 다시 실행한 경우
end $mig$;

-- ── 2. students 테이블 확장 ─────────────────────────────────────────────
do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'students'
                and column_name = 'nickname') then
    alter table public.students rename column nickname to name;
  end if;
  -- 제약 조건 이름도 따라 바꾼다. 없으면 그냥 넘어간다.
  if exists (select 1 from pg_constraint where conname = 'students_nickname_len') then
    alter table public.students rename constraint students_nickname_len to students_name_len;
  end if;
end $mig$;

alter table public.students
  add column if not exists school          text    not null default '',
  add column if not exists grade           text    not null default '',
  add column if not exists class_name      text    not null default '',
  add column if not exists is_active       boolean not null default true,
  add column if not exists password_hash   text,
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until    timestamptz;

-- 계정 방식으로 바뀌기 전부터 있던 학생에게는 알 수 없는 해시를 넣어 둔다.
-- (숫자 4자리가 아니므로 어떤 입력으로도 로그인되지 않는다. 선생님이 비밀번호를 새로 설정해야 한다.)
update public.students
   set password_hash = crypt(gen_random_uuid()::text, gen_salt('bf'))
 where password_hash is null;

alter table public.students alter column password_hash set not null;

alter table public.students drop constraint if exists students_profile_len;
alter table public.students add constraint students_profile_len check (
  char_length(school) <= 40 and char_length(grade) <= 20 and char_length(class_name) <= 40
);

-- 로그인 조회 키이자 동명이인 방지. 앞뒤 공백과 대소문자를 무시하고 하나만 허용한다.
create unique index if not exists students_name_key
  on public.students (lower(btrim(name)));

-- ── 3. 학생 로그인 ──────────────────────────────────────────────────────
-- 실패를 raise exception 으로 알리면 실패 횟수 UPDATE 까지 함께 롤백된다.
-- 그래서 성공/실패를 예외가 아니라 ok 플래그로 돌려준다.
-- OUT 파라미터 이름에 student_ 를 붙인 건 students 컬럼명과 겹치지 않게 하기 위해서다 (42702 방지).
create or replace function public.student_login(p_name text, p_password text)
returns table (ok boolean, message text, student_id uuid, student_name text)
language plpgsql security definer set search_path = public, extensions as $fn$
declare
  v_row   public.students%rowtype;
  v_key   text;
  v_fails integer;
begin
  v_key := lower(btrim(coalesce(p_name, '')));
  if v_key = '' then
    return query select false, '이름을 입력해 주세요.'::text, null::uuid, null::text;
    return;
  end if;
  if coalesce(p_password, '') !~ '^[0-9]{4}$' then
    return query select false, '비밀번호는 숫자 4자리입니다.'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_row from public.students s where lower(btrim(s.name)) = v_key;

  -- 없는 이름과 틀린 비밀번호를 같은 문구로 돌려준다. 누가 등록돼 있는지 떠보지 못하게.
  if not found or not v_row.is_active then
    return query select false, '이름 또는 비밀번호가 올바르지 않습니다.'::text, null::uuid, null::text;
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return query select false,
      '비밀번호를 여러 번 틀려 잠시 잠겼습니다. 5분 뒤에 다시 시도하거나 선생님께 문의해 주세요.'::text,
      null::uuid, null::text;
    return;
  end if;

  if crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    -- 잠금이 이미 풀린 상태였다면 횟수를 처음부터 다시 센다.
    v_fails := case when v_row.locked_until is not null then 0 else v_row.failed_attempts end + 1;
    update public.students
       set failed_attempts = v_fails,
           locked_until = case when v_fails >= 10 then now() + interval '5 minutes' else null end
     where id = v_row.id;
    return query select false, '이름 또는 비밀번호가 올바르지 않습니다.'::text, null::uuid, null::text;
    return;
  end if;

  update public.students
     set failed_attempts = 0, locked_until = null, last_seen_at = now()
   where id = v_row.id;

  return query select true, ''::text, v_row.id, v_row.name;
end $fn$;

-- 저장해 둔 세션이 아직 살아 있는지 확인한다. 지워졌거나 사용 중지된 계정이면 0행.
-- 이름이 바뀌었으면 새 이름을 돌려주므로 화면 표시도 따라온다.
create or replace function public.student_profile(p_student_id uuid)
returns table (student_id uuid, student_name text)
language sql security definer stable set search_path = public as $fn$
  select s.id, s.name from public.students s
   where s.id = p_student_id and s.is_active
$fn$;

revoke all on function public.student_login(text, text),
                       public.student_profile(uuid) from public;
grant execute on function public.student_login(text, text),
                          public.student_profile(uuid) to anon, authenticated;

-- 이름만 적으면 계정이 생기던 옛 방식은 더 이상 쓰지 않는다.
drop function if exists public.start_session(text);

-- ── 4. 사용 중지된 계정은 채점도 받지 못한다 ────────────────────────────
-- 조회만 막고 채점을 열어 두면 주소를 아는 학생이 계속 풀 수 있다.
-- 시그니처가 그대로이므로 create or replace 로 권한을 유지한다.
create or replace function public.submit_answer(
  p_student_id uuid, p_problem_id uuid, p_answer text)
returns table (is_correct boolean, already_solved boolean)
language plpgsql security definer set search_path = public as $fn$
declare v_answers text[]; v_correct boolean; v_already boolean; v_recent int;
begin
  if p_answer is null or btrim(p_answer) = '' or char_length(p_answer) > 500 then
    raise exception '답안이 비었거나 너무 깁니다.';
  end if;
  -- errors.ts 의 isInvalidSessionError 가 이 앞부분 문구로 만료된 세션을 알아낸다.
  if not exists (select 1 from students s where s.id = p_student_id and s.is_active) then
    raise exception '세션이 유효하지 않습니다. 다시 로그인해 주세요.';
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
end $fn$;

revoke all on function public.submit_answer(uuid, uuid, text) from public;
grant execute on function public.submit_answer(uuid, uuid, text) to anon, authenticated;

-- ── 5. 선생님용: 계정 만들기 · 비밀번호 설정 ────────────────────────────
-- 비밀번호를 해시로 바꾸는 일은 서버 안에서만 일어난다. 그래서 INSERT 권한은 열지 않고 RPC 로만 받는다.
-- security definer 라 RLS 를 우회하므로 함수 안에서 is_teacher() 를 직접 확인한다.
create or replace function public.teacher_create_student(
  p_name text, p_school text, p_grade text, p_class_name text, p_password text)
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
    raise exception '이미 "%" 학생이 있습니다. 이름만으로 로그인하므로 구분되게 적어 주세요 (예: %(중2)).',
      v_name, v_name;
  end if;

  insert into public.students (name, school, grade, class_name, password_hash)
  values (v_name,
          btrim(coalesce(p_school, '')),
          btrim(coalesce(p_grade, '')),
          btrim(coalesce(p_class_name, '')),
          crypt(p_password, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end $fn$;

create or replace function public.teacher_set_student_password(
  p_student_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not public.is_teacher() then
    raise exception '권한이 없습니다. 관리자 계정으로 로그인해 주세요.';
  end if;
  if coalesce(p_password, '') !~ '^[0-9]{4}$' then
    raise exception '비밀번호는 숫자 4자리로 입력해 주세요.';
  end if;

  update public.students
     set password_hash   = crypt(p_password, gen_salt('bf')),
         failed_attempts = 0,
         locked_until    = null
   where id = p_student_id;

  if not found then
    raise exception '학생을 찾을 수 없습니다.';
  end if;
end $fn$;

revoke all on function public.teacher_create_student(text, text, text, text, text),
                       public.teacher_set_student_password(uuid, text) from public;
grant execute on function public.teacher_create_student(text, text, text, text, text),
                          public.teacher_set_student_password(uuid, text) to authenticated;

-- ── 6. 학생 테이블 권한: 선생님도 비밀번호 해시는 못 읽는다 ─────────────
-- 4자리 비밀번호의 bcrypt 해시는 후보가 1만 개뿐이라 새어 나가면 평문이나 마찬가지다.
-- 그래서 컬럼 단위로 권한을 준다. INSERT 는 아예 없다 (위 RPC 로만 만든다).
drop policy if exists students_teacher_select on public.students;
drop policy if exists students_teacher_all on public.students;
create policy students_teacher_all on public.students
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

revoke all on public.students from anon, authenticated;
grant select (id, name, school, grade, class_name, is_active, created_at, last_seen_at)
  on public.students to authenticated;
grant update (name, school, grade, class_name, is_active)
  on public.students to authenticated;
grant delete on public.students to authenticated;

-- ── 7. 통계 뷰를 새 컬럼에 맞춘다 ───────────────────────────────────────
drop view if exists public.teacher_student_stats;
create view public.teacher_student_stats with (security_invoker = true) as
select s.id as student_id, s.name, s.school, s.grade, s.class_name, s.is_active,
       s.created_at, s.last_seen_at,
       count(sub.id)::int as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int as solved_count
from public.students s
left join public.submissions sub on sub.student_id = s.id
group by s.id;

drop view if exists public.teacher_student_season_stats;
create view public.teacher_student_season_stats with (security_invoker = true) as
select se.id as season_id,
       st.id as student_id,
       st.name, st.grade, st.class_name,
       count(sub.id)::int                                                 as attempt_count,
       count(distinct sub.problem_id) filter (where sub.is_correct)::int  as solved_count,
       max(sub.created_at)                                                as last_submitted_at
from public.seasons se
cross join public.students st
left join public.problems p      on p.season_id = se.id
left join public.submissions sub on sub.problem_id = p.id and sub.student_id = st.id
group by se.id, st.id;

revoke all on public.teacher_student_stats, public.teacher_student_season_stats from anon;
grant select on public.teacher_student_stats, public.teacher_student_season_stats to authenticated;
