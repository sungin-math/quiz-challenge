import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { useStudent } from '../lib/session';
import type { LoadState, SeasonProgressRow } from '../lib/types';

/** 학생이 처음 만나는 화면. 공개된 시즌만 내려온다. */
export default function SeasonList() {
  const student = useStudent();
  const studentId = student?.id ?? null;
  const [state, setState] = useState<LoadState<SeasonProgressRow[]>>({ status: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    if (!studentId) return;
    setState({ status: 'loading' });

    const { data, error } = await supabase.rpc('get_seasons_with_progress', {
      p_student_id: studentId,
    });

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
      <h1 className="text-xl font-bold text-slate-900">시즌을 고르세요</h1>

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
          아직 공개된 시즌이 없습니다. 선생님이 시즌을 열면 여기에 표시됩니다.
        </p>
      )}

      {state.status === 'ready' && state.value.length > 0 && (
        <ul className="mt-4 space-y-2">
          {state.value.map((season) => {
            const isComplete = season.total_problems > 0 && season.solved_count === season.total_problems;
            return (
              <li key={season.season_id}>
                <Link
                  to={`/seasons/${season.season_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{season.name}</span>
                    <span className="block text-xs text-slate-500">
                      {season.total_problems === 0
                        ? '아직 공개된 문제가 없습니다'
                        : `${season.total_problems}문제 중 ${season.solved_count}문제 정답`}
                    </span>
                  </span>
                  <span
                    className={
                      isComplete
                        ? 'shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700'
                        : 'shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600'
                    }
                  >
                    {isComplete ? '완료 ✓' : `${season.solved_count}/${season.total_problems}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Layout>
  );
}
