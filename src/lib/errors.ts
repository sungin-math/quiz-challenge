/**
 * Supabase 가 던지는 에러를 화면에 그대로 보여줄 수 있는 한국어 문장으로 바꾼다.
 *
 * 서버 함수(03_functions.sql)의 `raise exception` 메시지는 이미 한국어 사용자 문구이므로
 * 그대로 통과시킨다. 그 밖의 코드는 여기서 번역한다.
 */

interface SupabaseErrorShape {
  message: string;
  code?: string;
}

function asSupabaseError(error: unknown): SupabaseErrorShape | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { message?: unknown; code?: unknown };
  if (typeof candidate.message !== 'string') return null;
  return {
    message: candidate.message,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
  };
}

/**
 * submit_answer 가 "세션이 유효하지 않습니다" 로 거절한 경우인지.
 * (localStorage 에 남아 있는 학생 id 가 DB 에 없을 때 — 잘못 입력한 이어하기 코드 등)
 * 이때는 저장된 세션을 지우고 시작 화면으로 돌려보내야 한다.
 */
export function isInvalidSessionError(error: unknown): boolean {
  const supabaseError = asSupabaseError(error);
  if (!supabaseError || supabaseError.code !== 'P0001') return false;
  return supabaseError.message.startsWith('세션이 유효하지 않습니다');
}

export function toUserMessage(error: unknown): string {
  const supabaseError = asSupabaseError(error);
  if (!supabaseError) return '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

  const { message, code } = supabaseError;

  // plpgsql raise exception — 메시지가 이미 한국어 사용자 문구다.
  if (code === 'P0001') return message;

  switch (code) {
    case '42501':
      return '권한이 없습니다. 관리자 계정으로 로그인했는지 확인해 주세요.';
    case '23505':
      return '이미 처리된 내용입니다.';
    case '23514':
      return '입력값이 규칙에 맞지 않습니다. 제목과 정답 개수를 확인해 주세요.';
    case '22P02':
      return '코드 형식이 올바르지 않습니다. 이어하기 코드를 다시 확인해 주세요.';
    case 'PGRST202':
      return '서버 함수를 찾을 수 없습니다. Supabase SQL Editor에서 01~04 스크립트를 순서대로 실행했는지 확인해 주세요.';
    case 'PGRST301':
      return '접근 권한이 없습니다. 다시 로그인해 주세요.';
    default:
      break;
  }

  // Supabase Auth 는 code 없이 영어 message 만 주는 경우가 많다.
  if (message.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (message.includes('Email not confirmed')) {
    return '이메일 인증이 완료되지 않은 계정입니다. Supabase 대시보드에서 사용자를 확인해 주세요.';
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return '서버에 연결하지 못했습니다. 인터넷 연결과 VITE_SUPABASE_URL 값을 확인해 주세요.';
  }

  return `오류가 발생했습니다: ${message}`;
}
