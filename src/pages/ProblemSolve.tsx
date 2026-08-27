import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { problemImageUrl } from '../lib/images';
import { supabase } from '../lib/supabase';
import { isInvalidSessionError, toUserMessage } from '../lib/errors';
import { clearStudent, useStudent } from '../lib/session';
import type { LoadState, ProblemSummary } from '../lib/types';

/** 채점 결과 표시 상태. already 는 "이미 맞힌 문제" — 재채점 결과로 덮어쓰지 않는다. */
type Feedback =
  | { kind: 'none' }
  | { kind: 'correct' }
  | { kind: 'wrong' }
  | { kind: 'already' }
  | { kind: 'error'; message: string };

export default function ProblemSolve() {
  const { id: problemId } = useParams<{ id: string }>();
  const student = useStudent();
  const studentId = student?.id ?? null;
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState<ProblemSummary | null>>({ status: 'loading' });
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!problemId) return;
    setState({ status: 'loading' });

    const { data, error } = await supabase
      .rpc('get_problem', { p_problem_id: problemId });

    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({ status: 'ready', value: data?.[0] ?? null });
  }, [problemId]);

  useEffect(() => {
    setAnswer('');
    setFeedback({ kind: 'none' });
    void load();
  }, [load]);

  if (!student) return <Navigate to="/" replace />;
  if (!problemId) return <Navigate to="/seasons" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!studentId || !problemId) return;

    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      setFeedback({ kind: 'error', message: '답을 입력해 주세요.' });
      return;
    }
    if (trimmed.length > 500) {
      setFeedback({ kind: 'error', message: '답이 너무 깁니다. 500자 이내로 입력해 주세요.' });
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase
      .rpc('submit_answer', {
        p_student_id: studentId,
        p_problem_id: problemId,
        p_answer: trimmed,
      });
    setIsSubmitting(false);

    if (error) {
      // 저장된 학생 id 가 서버에 없는 경우 — 세션을 버리고 처음부터 다시 시작시킨다.
      if (isInvalidSessionError(error)) {
        clearStudent();
        navigate('/', { replace: true });
        return;
      }
      setFeedback({ kind: 'error', message: toUserMessage(error) });
      return;
    }

    const result = data?.[0];
    if (!result) {
      setFeedback({ kind: 'error', message: '채점 결과를 받지 못했습니다. 다시 제출해 주세요.' });
      return;
    }

    // 이미 맞힌 문제는 재채점 결과와 무관하게 "이미 맞힘" 으로 둔다.
    if (result.already_solved) {
      setFeedback({ kind: 'already' });
      return;
    }
    if (result.is_correct) {
      setFeedback({ kind: 'correct' });
      setAnswer('');
      return;
    }
    setFeedback({ kind: 'wrong' });
  }

  const isSolved = feedback.kind === 'correct' || feedback.kind === 'already';

  // 문제를 아직 못 불러왔으면 어느 시즌인지 알 수 없으므로 시즌 목록으로 보낸다.
  const backTo =
    state.status === 'ready' && state.value !== null ? `/seasons/${state.value.season_id}` : '/seasons';

  return (
    <Layout>
      <Link to={backTo} className="text-sm text-stone-500 hover:text-stone-800">
        ← 문제 목록
      </Link>

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

      {state.status === 'ready' && state.value === null && (
        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          문제를 찾을 수 없습니다. 삭제되었거나 아직 공개되지 않은 문제입니다.
        </p>
      )}

      {state.status === 'ready' && state.value !== null && (
        <article className="mt-4">
          <h1 className="text-xl font-bold text-stone-900">
            <MathText text={state.value.title} />
          </h1>
          {state.value.body.trim().length > 0 && (
            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-4 text-stone-800">
              <MathText text={state.value.body} />
            </p>
          )}
          {/* 05_media.sql 을 아직 실행하지 않은 서버는 이 필드를 아예 내려주지 않는다.
              null 뿐 아니라 undefined 도 걸러야 화면이 깨지지 않는다. */}
          {state.value.image_path && (
            <figure className="mt-3 rounded-lg border border-stone-200 bg-white p-2">
              <img
                src={problemImageUrl(state.value.image_path)}
                alt="문제에 딸린 그림"
                loading="lazy"
                className="mx-auto max-h-[70vh] w-auto max-w-full"
              />
            </figure>
          )}

          <form onSubmit={handleSubmit} className="mt-4">
            <label htmlFor="answer" className="block text-sm font-medium text-stone-700">
              정답
            </label>
            <input
              id="answer"
              type="text"
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value);
                if (feedback.kind === 'wrong' || feedback.kind === 'error') setFeedback({ kind: 'none' });
              }}
              maxLength={500}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-3 w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto sm:px-8"
            >
              {isSubmitting ? '채점 중…' : '제출하기'}
            </button>
          </form>

          {feedback.kind === 'correct' && (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              정답입니다! 🎉
            </p>
          )}
          {feedback.kind === 'already' && (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              이미 맞힌 문제입니다.
            </p>
          )}
          {feedback.kind === 'wrong' && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              오답입니다. 다시 시도해 보세요.
            </p>
          )}
          {feedback.kind === 'error' && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {feedback.message}
            </p>
          )}

          {isSolved && (
            <Link
              to={backTo}
              className="mt-4 inline-block rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              다른 문제 풀러 가기
            </Link>
          )}
        </article>
      )}
    </Layout>
  );
}
