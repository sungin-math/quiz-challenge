-- 03_functions.sql — 학생 화면이 호출하는 RPC 4개 + 정답 정규화 함수
--
-- 모두 security definer 이므로 RLS 를 우회해 테이블을 읽는다.
-- 대신 반환 컬럼에 answers 를 절대 포함하지 않는다. 정답은 서버 밖으로 나가지 않는다.

-- 정규화 순서: NFKC 정규화 → 앞뒤 공백 제거 → 연속 공백 1칸 축소 → 소문자
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

  -- 속도 제한: 최근 1분간 30회까지
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

  -- 이미 맞힌 문제는 기록을 남기지 않는다 (정답 유니크 인덱스와도 충돌하지 않음).
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
