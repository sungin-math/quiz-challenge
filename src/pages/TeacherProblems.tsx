import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { removeProblemImage } from '../lib/images';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { LoadState, Problem, Season } from '../lib/types';

/** 문제와 시즌을 함께 들고 있어야 목록에 시즌 이름을 붙일 수 있다. */
type Loaded = { problems: Problem[]; seasons: Season[] };

export default function TeacherProblems() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const seasonFilter = searchParams.get('season') ?? '';
  const [state, setState] = useState<LoadState<Loaded>>({ status: 'loading' });
  const [busyProblemId, setBusyProblemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const [problemsResult, seasonsResult] = await Promise.all([
      supabase
        .from('problems')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<Problem[]>(),
      supabase
        .from('seasons')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<Season[]>(),
    ]);

    const error = problemsResult.error ?? seasonsResult.error;
    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({
      status: 'ready',
      value: { problems: problemsResult.data ?? [], seasons: seasonsResult.data ?? [] },
    });
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

    if (!error && problem.image_path) {
      // 문제가 사라졌으니 딸린 그림도 저장소에서 지운다.
      await removeProblemImage(problem.image_path);
    }

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

  const seasons = state.status === 'ready' ? state.value.seasons : [];
  const visibleProblems =
    state.status === 'ready'
      ? state.value.problems.filter((problem) => seasonFilter === '' || problem.season_id === seasonFilter)
      : [];
  const seasonNameOf = (problem: Problem): string =>
    seasons.find((season) => season.id === problem.season_id)?.name ?? '(시즌 없음)';

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">문제 관리</h1>
        <div className="flex gap-2">
          <Link
            to={seasonFilter === '' ? '/teacher/problems/new' : `/teacher/problems/new?season=${seasonFilter}`}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="seasonFilter" className="text-sm text-slate-600">
          시즌
        </label>
        <select
          id="seasonFilter"
          value={seasonFilter}
          onChange={(event) => {
            const next = event.target.value;
            setSearchParams(next === '' ? {} : { season: next }, { replace: true });
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">전체 시즌</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.is_published ? '' : ' (비공개)'}
            </option>
          ))}
        </select>
        <Link to="/teacher/seasons" className="text-sm text-indigo-600 hover:text-indigo-800">
          시즌 관리 →
        </Link>
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

      {state.status === 'ready' && seasons.length === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          아직 시즌이 없습니다. 문제는 시즌에 속해야 하므로{' '}
          <Link to="/teacher/seasons" className="font-medium underline">
            시즌 관리
          </Link>
          에서 먼저 시즌을 만들어 주세요.
        </p>
      )}

      {state.status === 'ready' && seasons.length > 0 && visibleProblems.length === 0 && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {seasonFilter === ''
            ? '등록된 문제가 없습니다. "새 문제" 버튼으로 첫 문제를 만들어 보세요.'
            : '이 시즌에는 아직 문제가 없습니다.'}
        </p>
      )}

      {state.status === 'ready' && visibleProblems.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visibleProblems.map((problem) => (
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
                  <span className="truncate rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {seasonNameOf(problem)}
                  </span>
                </div>
                <p className="mt-1 truncate font-medium text-slate-900"><MathText text={problem.title} /></p>
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
