import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase 환경변수가 없습니다. 프로젝트 루트에 .env.local 파일을 만들고 ' +
      'VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 채운 뒤 개발 서버를 다시 시작하세요. ' +
      '(.env.example 참고)',
  );
}

/**
 * 앱 전체가 공유하는 Supabase 클라이언트.
 * anon 키만 사용한다. service_role 키는 브라우저 코드에 절대 넣지 않는다.
 */
export const supabase = createClient<Database>(url, anonKey);
