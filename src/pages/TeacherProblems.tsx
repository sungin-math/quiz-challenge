import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { LoadState, Problem } from '../lib/types';

export default function TeacherProblems() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState<Problem[]>>({ status: 'loading' });
  const [busyProblemId, setBusyProblemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const { data, error } = await supabase
      .from('problems')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<Problem[]>();

    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({ status: 'ready', value: data ?? [] });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePublished(problem: Problem): Promise<void> {
    setActionError(null);
    setBusyProblemId(problem.id);

    const { error } = await supabase
      .from('problems')
      .update({ is_published: !problem.is_published })
      .eq('id', problem.id);

    setBusyProblemId(null);
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function remove(problem: Problem): Promise<void> {
    const confirmed = window.confirm(
      `"${problem.title}" 문제를 삭제할까요?\n이 문제에 대한 학생들의 제출 기록도 함께 삭제됩니다.`,
    );
    if (!confirmed) return;

    setActionError(null);
    setBusyProblemId(problem.id);

    const { error } = await supabase.from('problems').delete().eq('id', problem.id);

    setBusyProblemId(null);
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    navigate('/teacher/login', { replace: true });
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">문제 관리</h1>
        <div className="flex gap-2">
          <Link
            to="/teacher/problems/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            새 문제
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

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
          등록된 문제가 없습니다. "새 문제" 버튼으로 첫 문제를 만들어 보세요.
        </p>
      )}

      {state.status === 'ready' && state.value.length > 0 && (
        <ul className="mt-4 space-y-2">
          {state.value.map((problem) => (
            <li
              key={problem.id}
              className="rounded-lg border border-slate-200 bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">#{problem.order_index}</span>
                  <span
                    className={
                      problem.is_published
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500'
                    }
                  >
                    {problem.is_published ? '공개' : '비공개'}
                  </span>
                </div>
                <p className="mt-1 truncate font-medium text-slate-900">{problem.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  정답 {problem.answers.length}개: {problem.answers.join(' / ')}
                </p>
              </div>

              <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => void togglePublished(problem)}
                  disabled={busyProblemId === problem.id}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {problem.is_published ? '비공개로' : '공개로'}
                </button>
                <Link
                  to={`/teacher/problems/${problem.id}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  수정
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(problem)}
                  disabled={busyProblemId === problem.id}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
