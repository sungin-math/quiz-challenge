-- 05_media.sql — 수식(LaTeX)·이미지 지원을 위한 변경분
--
-- 01~04 를 이미 실행한 프로젝트에 그대로 덧씌운다. 여러 번 실행해도 안전하다.
--
-- 수식은 DB 를 건드리지 않는다. 본문 text 안에 $...$ 로 적힌 LaTeX 를 학생 브라우저가
-- KaTeX 로 렌더링할 뿐이다. 여기서 추가하는 것은 이미지 1장을 위한 컬럼과 저장소뿐이다.

-- ── 1. 문제당 이미지 1장 ────────────────────────────────────────────────
-- storage 오브젝트의 경로만 담는다 (예: 3f2a....png). 전체 URL 은 화면에서 조립한다.
alter table public.problems
  add column if not exists image_path text;

-- ── 2. get_problem 이 이미지 경로도 내려주도록 교체 ──────────────────────
-- 반환 타입이 바뀌므로 create or replace 로는 안 되고 drop 이 필요하다.
-- drop 하면 권한도 함께 사라지므로 아래에서 grant 를 다시 해준다.
-- answers 는 여전히 반환하지 않는다. 정답은 서버 밖으로 나가지 않는다.
drop function if exists public.get_problem(uuid);

create function public.get_problem(p_problem_id uuid)
returns table (problem_id uuid, title text, body text, image_path text)
language sql security definer stable set search_path = public as $$
  select p.id, p.title, p.body, p.image_path
  from problems p
  where p.id = p_problem_id and p.is_published
$$;

revoke all on function public.get_problem(uuid) from public;
grant execute on function public.get_problem(uuid) to anon, authenticated;

-- ── 3. 이미지 저장소 ────────────────────────────────────────────────────
-- public = true : 학생은 로그인이 없으므로 읽기는 공개여야 한다.
-- 파일 이름이 랜덤 UUID 라 주소를 모르면 접근할 수 없고, 애초에 공개 문제의
-- 본문 이미지이므로 공개돼도 문제되지 않는다. 정답은 이미지가 아니라 DB 에 있다.
insert into storage.buckets (id, name, public)
values ('problem-images', 'problem-images', true)
on conflict (id) do update set public = true;

-- 용량·형식 제한을 서버에서 강제한다 (브라우저 검사만 믿지 않는다).
update storage.buckets
   set file_size_limit  = 5242880,  -- 5MB
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 where id = 'problem-images';

-- 업로드·교체·삭제는 선생님만. 읽기는 public 버킷이라 정책 없이도 열려 있다.
drop policy if exists problem_images_teacher_write on storage.objects;
create policy problem_images_teacher_write on storage.objects
  for all to authenticated
  using      (bucket_id = 'problem-images' and public.is_teacher())
  with check (bucket_id = 'problem-images' and public.is_teacher());
