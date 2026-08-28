import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { clearStudent, displayName, useStudent } from '../lib/session';
import type { LoadState, SeasonProgressRow } from '../lib/types';

export default function MyProgress() {
  const student = useStudent();
  const studentId = student?.id ?? null;
  const navigate = useNavigate();

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

  // 전체 합계는 모든 시즌을 더한 값이다. 계정은 하나이므로 기록도 시즌을 넘어 하나로 이어진다.
  const seasons = state.status === 'ready' ? state.value : [];
  const solvedCount = seasons.reduce((sum, season) => sum + season.solved_count, 0);
  const totalCount = seasons.reduce((sum, season) => sum + season.total_problems, 0);

  return (
    <Layout>
      <h1 className="text-xl font-bold text-stone-900">내 기록</h1>
      <p className="mt-1 text-sm text-stone-600">{displayName(student)} 님</p>

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

      {state.status === 'ready' && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center">
          {totalCount === 0 ? (
            <p className="text-sm text-stone-500">아직 공개된 문제가 없습니다.</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-brand-600">
                {solvedCount}
                <span className="text-xl font-medium text-stone-400"> / {totalCount}</span>
              </p>
              <p className="mt-1 text-sm text-stone-600">전체 시즌에서 맞힌 문제 수</p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.round((solvedCount / totalCount) * 100)}%` }}
                />
              </div>
            </>
          )}
        </section>
      )}

      {state.status === 'ready' && seasons.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-medium text-stone-700">시즌별 진행률</h2>
          <ul className="mt-2 space-y-2">
            {seasons.map((season) => (
              <li key={season.season_id}>
                <Link
                  to={`/seasons/${season.season_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">
                    {season.name}
                  </span>
                  <span className="shrink-0 text-sm text-stone-600">
                    {season.solved_count} / {season.total_problems}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/seasons"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          문제 풀러 가기
        </Link>
        <button
          type="button"
          onClick={() => {
            clearStudent();
            navigate('/', { replace: true });
          }}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          로그아웃
        </button>
      </div>
    </Layout>
  );
}
