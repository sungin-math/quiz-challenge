import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { useStudent } from '../lib/session';
import type { LoadState, ProgressRow } from '../lib/types';

export default function ProblemList() {
  const student = useStudent();
  const studentId = student?.id ?? null;
  const [state, setState] = useState<LoadState<ProgressRow[]>>({ status: 'loading' });

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

  return (
    <Layout>
      <h1 className="text-xl font-bold text-slate-900">문제 목록</h1>

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

      {state.status === 'ready' && state.value.length === 0 && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          아직 공개된 문제가 없습니다. 선생님이 문제를 올리면 여기에 표시됩니다.
        </p>
      )}

      {state.status === 'ready' && state.value.length > 0 && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            총 {state.value.length}문제 중 {state.value.filter((row) => row.solved).length}문제를 맞혔습니다.
          </p>
          <ul className="mt-4 space-y-2">
            {state.value.map((row, index) => (
              <li key={row.problem_id}>
                <Link
                  to={`/problems/${row.problem_id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <span
                    className={
                      row.solved
                        ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700'
                        : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-500'
                    }
                  >
                    {row.solved ? '✓' : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900"><MathText text={row.title} /></span>
                    <span className="block text-xs text-slate-500">
                      {row.solved ? '정답' : row.attempts > 0 ? `${row.attempts}번 시도함` : '아직 풀지 않음'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Layout>
  );
}
