import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import Layout from './Layout';

type Access =
  | { status: 'checking' }
  | { status: 'allowed' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

/**
 * 관리자 전용 라우트 가드.
 * Supabase Auth 세션이 있고, 그 사용자가 teachers 테이블에 등록돼 있어야 통과한다.
 * (실제 권한은 서버의 RLS 가 강제한다. 이 컴포넌트는 화면 흐름만 담당한다.)
 */
export default function RequireTeacher() {
  const [access, setAccess] = useState<Access>({ status: 'checking' });
  const [revision, setRevision] = useState(0);

  // 로그인/로그아웃이 일어나면 다시 확인한다.
  // 콜백 안에서 supabase 를 다시 호출하면 교착이 생길 수 있어 state 만 건드린다.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      setRevision((current) => current + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function check(): Promise<void> {
      setAccess({ status: 'checking' });

      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        setAccess({ status: 'error', message: toUserMessage(sessionError) });
        return;
      }

      const userId = sessionResult.session?.user.id;
      if (!userId) {
        setAccess({ status: 'denied' });
        return;
      }

      const { data: rows, error } = await supabase
        .from('teachers')
        .select('id')
        .eq('id', userId)
        .limit(1)
        .returns<{ id: string }[]>();
      if (!active) return;
      if (error) {
        setAccess({ status: 'error', message: toUserMessage(error) });
        return;
      }
      setAccess({ status: rows && rows.length > 0 ? 'allowed' : 'denied' });
    }

    void check();
    return () => {
      active = false;
    };
  }, [revision]);

  if (access.status === 'checking') {
    return (
      <Layout>
        <p className="text-slate-500">권한을 확인하는 중입니다…</p>
      </Layout>
    );
  }

  if (access.status === 'error') {
    return (
      <Layout>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{access.message}</p>
          <button
            type="button"
            onClick={() => setRevision((current) => current + 1)}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      </Layout>
    );
  }

  if (access.status === 'denied') return <Navigate to="/teacher/login" replace />;

  return <Outlet />;
}
