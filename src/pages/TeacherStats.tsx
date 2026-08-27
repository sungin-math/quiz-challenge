import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type {
  LoadState,
  ProblemStats,
  SeasonStats,
  StudentSeasonStats,
  StudentStats,
} from '../lib/types';

interface Stats {
  seasons: SeasonStats[];
  students: StudentStats[];
  studentSeasons: StudentSeasonStats[];
  problems: ProblemStats[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 정답 제출 ÷ 전체 제출. 제출이 없으면 표시할 값이 없다. */
function accuracy(correct: number, attempts: number): string {
  if (attempts === 0) return '—';
  return `${Math.round((correct / attempts) * 100)}%`;
}

export default function TeacherStats() {
  const [state, setState] = useState<LoadState<Stats>>({ status: 'loading' });
  /** 빈 문자열이면 전체 시즌. */
  const [seasonFilter, setSeasonFilter] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const [seasonResult, studentResult, studentSeasonResult, problemResult] = await Promise.all([
      supabase
        .from('teacher_season_stats')
        .select('*')
        .order('order_index', { ascending: true })
        .returns<SeasonStats[]>(),
      supabase
        .from('teacher_student_stats')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .returns<StudentStats[]>(),
      supabase
        .from('teacher_student_season_stats')
        .select('*')
        .returns<StudentSeasonStats[]>(),
      supabase
        .from('teacher_problem_stats')
        .select('*')
        .order('order_index', { ascending: true })
        .returns<ProblemStats[]>(),
    ]);

    const error =
      seasonResult.error ?? studentResult.error ?? studentSeasonResult.error ?? problemResult.error;
    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }

    setState({
      status: 'ready',
      value: {
        seasons: seasonResult.data ?? [],
        students: studentResult.data ?? [],
        studentSeasons: studentSeasonResult.data ?? [],
        problems: problemResult.data ?? [],
      },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = state.status === 'ready' ? state.value : null;
  const selectedSeason = stats?.seasons.find((season) => season.season_id === seasonFilter) ?? null;

  const visibleProblems =
    stats?.problems.filter((row) => seasonFilter === '' || row.season_id === seasonFilter) ?? [];

  // 시즌을 고르면 그 시즌 기준 표로, 전체이면 지금까지의 누적 표로 바꾼다.
  const visibleStudentSeasons = (stats?.studentSeasons ?? [])
    .filter((row) => row.season_id === seasonFilter)
    .sort((a, b) => b.solved_count - a.solved_count || a.nickname.localeCompare(b.nickname, 'ko'));

  return (
    <Layout>
      <h1 className="text-xl font-bold text-slate-900">통계</h1>

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

      {stats !== null && (
        <div className="mt-4 space-y-8">
          <section>
            <h2 className="text-base font-semibold text-slate-800">시즌별</h2>
            {stats.seasons.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                아직 시즌이 없습니다.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">시즌</th>
                      <th className="px-3 py-2 font-medium">공개</th>
                      <th className="px-3 py-2 text-right font-medium">문제</th>
                      <th className="px-3 py-2 text-right font-medium">참여 학생</th>
                      <th className="px-3 py-2 text-right font-medium">제출</th>
                      <th className="px-3 py-2 text-right font-medium">정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.seasons.map((row) => (
                      <tr key={row.season_id} className="border-t border-slate-100">
                        <td className="max-w-[14rem] truncate px-3 py-2 text-slate-900">{row.name}</td>
                        <td className="px-3 py-2 text-slate-500">{row.is_published ? '공개' : '비공개'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.published_problem_count}
                          {row.problem_count !== row.published_problem_count && (
                            <span className="text-slate-400"> / {row.problem_count}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.participant_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.attempt_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                          {accuracy(row.correct_count, row.attempt_count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              문제 열은 <strong>공개 / 전체</strong> 입니다. 정답률은 정답 제출 ÷ 전체 제출이라, 오답을 여러 번
              시도할수록 낮아집니다.
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="statsSeason" className="text-sm text-slate-600">
              아래 표 기준
            </label>
            <select
              id="statsSeason"
              value={seasonFilter}
              onChange={(event) => setSeasonFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">전체 시즌 (누적)</option>
              {stats.seasons.map((season) => (
                <option key={season.season_id} value={season.season_id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          <section>
            <h2 className="text-base font-semibold text-slate-800">
              문제별
              {selectedSeason !== null && (
                <span className="ml-2 text-sm font-normal text-slate-500">{selectedSeason.name}</span>
              )}
            </h2>
            {visibleProblems.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                {seasonFilter === '' ? '등록된 문제가 없습니다.' : '이 시즌에는 문제가 없습니다.'}
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      {seasonFilter === '' && <th className="px-3 py-2 font-medium">시즌</th>}
                      <th className="px-3 py-2 font-medium">제목</th>
                      <th className="px-3 py-2 font-medium">공개</th>
                      <th className="px-3 py-2 text-right font-medium">시도 수</th>
                      <th className="px-3 py-2 text-right font-medium">시도 학생</th>
                      <th className="px-3 py-2 text-right font-medium">정답 학생</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProblems.map((row) => (
                      <tr key={row.problem_id} className="border-t border-slate-100">
                        {seasonFilter === '' && (
                          <td className="max-w-[10rem] truncate px-3 py-2 text-slate-500">{row.season_name}</td>
                        )}
                        <td className="max-w-[16rem] truncate px-3 py-2 text-slate-900">
                          <MathText text={row.title} />
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.is_published ? '공개' : '비공개'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.total_attempts}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.attempted_students}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                          {row.solved_students}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800">
              학생별
              {selectedSeason !== null && (
                <span className="ml-2 text-sm font-normal text-slate-500">{selectedSeason.name}</span>
              )}
            </h2>

            {selectedSeason === null ? (
              stats.students.length === 0 ? (
                <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                  아직 참여한 학생이 없습니다.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">이름</th>
                        <th className="px-3 py-2 text-right font-medium">맞힌 문제</th>
                        <th className="px-3 py-2 text-right font-medium">제출 수</th>
                        <th className="px-3 py-2 font-medium">마지막 활동</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.students.map((row) => (
                        <tr key={row.student_id} className="border-t border-slate-100">
                          <td className="max-w-[12rem] truncate px-3 py-2 text-slate-900">{row.nickname}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                            {row.solved_count}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.attempt_count}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDateTime(row.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : visibleStudentSeasons.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                아직 참여한 학생이 없습니다.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">이름</th>
                      <th className="px-3 py-2 text-right font-medium">맞힌 문제</th>
                      <th className="px-3 py-2 text-right font-medium">제출 수</th>
                      <th className="px-3 py-2 font-medium">마지막 제출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudentSeasons.map((row) => (
                      <tr key={row.student_id} className="border-t border-slate-100">
                        <td className="max-w-[12rem] truncate px-3 py-2 text-slate-900">{row.nickname}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                          {row.solved_count}
                          <span className="font-normal text-slate-400">
                            {' '}
                            / {selectedSeason.published_problem_count}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.attempt_count}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {row.last_submitted_at === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            formatDateTime(row.last_submitted_at)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedSeason !== null && (
              <p className="mt-1 text-xs text-slate-500">
                이 시즌에 한 번도 제출하지 않은 학생도 0 으로 표시됩니다.
              </p>
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}
