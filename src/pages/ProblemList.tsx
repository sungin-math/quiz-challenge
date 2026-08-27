import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { useStudent } from '../lib/session';
import type { LoadState, ProgressRow } from '../lib/types';

/** 시즌 하나의 문제 목록. 시즌 이름은 주소로 바로 들어와도 보여야 하므로 함께 조회한다. */
type Loaded = { seasonName: string | null; rows: ProgressRow[] };

export default function ProblemList() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const student = useStudent();
  const studentId = student?.id ?? null;
  const [state, setState] = useState<LoadState<Loaded>>({ status: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    if (!studentId || !seasonId) return;
    setState({ status: 'loading' });

    const [problemsResult, seasonsResult] = await Promise.all([
      supabase.rpc('get_problems_with_progress', {
        p_student_id: studentId,
        p_season_id: seasonId,
      }),
      supabase.rpc('get_seasons_with_progress', { p_student_id: studentId }),
    ]);

    if (problemsResult.error) {
      setState({ status: 'error', message: toUserMessage(problemsResult.error) });
      return;
    }

    // 시즌 이름 조회가 실패해도 문제 목록은 보여준다. 이름은 장식일 뿐이다.
    const season = seasonsResult.data?.find((row) => row.season_id === seasonId);
    setState({
      status: 'ready',
      value: { seasonName: season?.name ?? null, rows: problemsResult.data ?? [] },
    });
  }, [studentId, seasonId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!student) return <Navigate to="/" replace />;
  if (!seasonId) return <Navigate to="/seasons" replace />;

  return (
    <Layout>
      <Link to="/seasons" className="text-sm text-stone-500 hover:text-stone-800">
        ← 시즌 목록
      </Link>
      <h1 className="mt-2 text-xl font-bold text-stone-900">
        {state.status === 'ready' && state.value.seasonName !== null ? state.value.seasonName : '문제 목록'}
      </h1>

      {state.status === 'loading' && <p className="mt-4 text-stone-500">불러오는 중입니다…</p>}

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

      {state.status === 'ready' && state.value.rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          이 시즌에는 아직 공개된 문제가 없습니다. 선생님이 문제를 올리면 여기에 표시됩니다.
        </p>
      )}

      {state.status === 'ready' && state.value.rows.length > 0 && (
        <>
          <p className="mt-2 text-sm text-stone-600">
            총 {state.value.rows.length}문제 중 {state.value.rows.filter((row) => row.solved).length}문제를 맞혔습니다.
          </p>
          <ul className="mt-4 space-y-2">
            {state.value.rows.map((row, index) => (
              <li key={row.problem_id}>
                <Link
                  to={`/problems/${row.problem_id}`}
                  className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-brand-300 hover:bg-brand-50"
                >
                  <span
                    className={
                      row.solved
                        ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700'
                        : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-500'
                    }
                  >
                    {row.solved ? '✓' : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-stone-900">
                      <MathText text={row.title} />
                    </span>
                    <span className="block text-xs text-stone-500">
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
