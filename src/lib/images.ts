import { supabase } from './supabase';
import { toUserMessage } from './errors';

/**
 * 문제 본문에 붙는 이미지 1장(그래프·도형)을 Supabase Storage 로 다루는 부분.
 *
 * 버킷은 public 이라 학생은 로그인 없이 이미지를 볼 수 있다.
 * 업로드·삭제는 05_media.sql 의 정책에 따라 선생님 계정만 가능하다.
 * 아래 제한은 브라우저에서 미리 걸러주는 용도이고, 진짜 강제는 버킷 설정이 한다.
 */
export const PROBLEM_IMAGE_BUCKET = 'problem-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** <input type="file"> 의 accept 속성에 넣을 값. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');

export type UploadResult = { path: string } | { error: string };

/** 저장된 경로를 학생 브라우저가 바로 쓸 수 있는 주소로 바꾼다. */
export function problemImageUrl(path: string): string {
  return supabase.storage.from(PROBLEM_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function extensionOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  if (fromName && /^[a-zA-Z0-9]{1,5}$/.test(fromName)) return fromName.toLowerCase();
  return file.type === 'image/png' ? 'png' : 'jpg';
}

export async function uploadProblemImage(file: File): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: 'PNG · JPG · WEBP · GIF 형식만 올릴 수 있습니다.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const megabytes = (file.size / 1024 / 1024).toFixed(1);
    return { error: `이미지가 너무 큽니다 (${megabytes}MB). 5MB 이하로 줄여서 올려주세요.` };
  }

  // 파일 이름은 추측할 수 없는 UUID 로 둔다. 원본 이름의 한글·공백이 주소에 섞이지 않는다.
  const path = `${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage
    .from(PROBLEM_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: toUserMessage(error) };
  return { path };
}

/**
 * 저장소에서 파일을 지운다.
 * 실패해도 화면 흐름을 막지 않는다 — 남은 파일은 아무도 참조하지 않는 고아 파일일 뿐이다.
 */
export async function removeProblemImage(path: string): Promise<void> {
  await supabase.storage.from(PROBLEM_IMAGE_BUCKET).remove([path]);
}
