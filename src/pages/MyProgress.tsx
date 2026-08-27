import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { clearStudent, displayName, useStudent } from '../lib/session';
import type { LoadState, ProgressRow } from '../lib/types';

export default function MyProgress() {
  const student = useStudent();
  const studentId = student?.id ?? null;
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState<ProgressRow[]>>({ status: 'loading' });
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!studentId) return;
    setState({ status: 'loading' });

    const { data, error } = await supabase
      .rpc('get_problems_with_progress', { p_student_id: studentId });

    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({ status: 'ready', value: data ?? [] });
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!student) return <Navigate to="/" replace />;

  async function handleCopy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopyNotice('이어하기 코드를 복사했습니다.');
    } catch (error) {
      console.warn('클립보드 복사 실패', error);
      setCopyNotice('복사하지 못했습니다. 코드를 길게 눌러 직접 복사해 주세요.');
    }
  }

  const solvedCount = state.status === 'ready' ? state.value.filter((row) => row.solved).length : 0;
  const totalCount = state.status === 'ready' ? state.value.length : 0;

  return (
    <Layout>
      <h1 className="text-xl font-bold text-slate-900">내 기록</h1>
      <p className="mt-1 text-sm text-slate-600">{displayName(student)} 님</p>

      {state.status === 'loading' && <p className="mt-4 text-slate-500">불러오는 중입니다…</p>}

      {state.status === 'error' && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-center">
          {totalCount === 0 ? (
            <p className="text-sm text-slate-500">아직 공개된 문제가 없습니다.</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">
                {solvedCount}
                <span className="text-xl font-medium text-slate-400"> / {totalCount}</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">맞힌 문제 수</p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.round((solvedCount / totalCount) * 100)}%` }}
                />
              </div>
            </>
          )}
        </section>
      )}

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">이어하기 코드</h2>
        <p className="mt-1 text-xs text-slate-500">
          다른 기기에서 이어서 풀거나, 브라우저 기록을 지운 뒤 복구할 때 필요합니다. 남에게 알려주지 마세요.
        </p>
        <p className="mt-2 break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">
          {student.id}
        </p>
        <button
          type="button"
          onClick={() => void handleCopy(student.id)}
          className="mt-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          코드 복사
        </button>
        {copyNotice && <p className="mt-2 text-xs text-slate-500">{copyNotice}</p>}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/problems"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          문제 풀러 가기
        </Link>
        <button
          type="button"
          onClick={() => {
            clearStudent();
            navigate('/', { replace: true });
          }}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          이 기기에서 나가기
        </button>
      </div>
    </Layout>
  );
}
