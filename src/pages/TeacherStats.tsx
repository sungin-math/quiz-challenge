import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { LoadState, ProblemStats, StudentStats } from '../lib/types';

interface Stats {
  students: StudentStats[];
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

export default function TeacherStats() {
  const [state, setState] = useState<LoadState<Stats>>({ status: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const [studentResult, problemResult] = await Promise.all([
      supabase
        .from('teacher_student_stats')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .returns<StudentStats[]>(),
      supabase
        .from('teacher_problem_stats')
        .select('*')
        .order('order_index', { ascending: true })
        .returns<ProblemStats[]>(),
    ]);

    if (studentResult.error) {
      setState({ status: 'error', message: toUserMessage(studentResult.error) });
      return;
    }
    if (problemResult.error) {
      setState({ status: 'error', message: toUserMessage(problemResult.error) });
      return;
    }

    setState({
      status: 'ready',
      value: { students: studentResult.data ?? [], problems: problemResult.data ?? [] },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

      {state.status === 'ready' && (
        <div className="mt-4 space-y-8">
          <section>
            <h2 className="text-base font-semibold text-slate-800">문제별</h2>
            {state.value.problems.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                등록된 문제가 없습니다.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">제목</th>
                      <th className="px-3 py-2 font-medium">공개</th>
                      <th className="px-3 py-2 text-right font-medium">시도 수</th>
                      <th className="px-3 py-2 text-right font-medium">시도 학생</th>
                      <th className="px-3 py-2 text-right font-medium">정답 학생</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.value.problems.map((row) => (
                      <tr key={row.problem_id} className="border-t border-slate-100">
                        <td className="max-w-[16rem] truncate px-3 py-2 text-slate-900">{row.title}</td>
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
            <h2 className="text-base font-semibold text-slate-800">학생별</h2>
            {state.value.students.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                아직 참여한 학생이 없습니다.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">이름</th>
                      <th className="px-3 py-2 text-right font-medium">맞힌 문제</th>
                      <th className="px-3 py-2 text-right font-medium">제출 수</th>
                      <th className="px-3 py-2 font-medium">마지막 활동</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.value.students.map((row) => (
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
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}
