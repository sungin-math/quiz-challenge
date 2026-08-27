import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { Problem } from '../lib/types';

/** 기존 문제를 불러오는 동안의 상태. 새 문제는 불러올 것이 없으므로 곧바로 ready. */
type EditorState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready' };

const ANSWER_GUIDE =
  "정답은 한 줄에 하나씩. 대소문자와 앞뒤 공백은 무시되지만 '10'과 '십'은 다르게 처리되니 표기 변형을 모두 적어주세요";

/** textarea 한 줄 = 정답 하나. 빈 줄은 버린다. */
function parseAnswers(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function TeacherProblemEdit() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [editorState, setEditorState] = useState<EditorState>(isNew ? { status: 'ready' } : { status: 'loading' });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [answersText, setAnswersText] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [orderIndex, setOrderIndex] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!id || id === 'new') return;
    setEditorState({ status: 'loading' });

    const { data, error } = await supabase
      .from('problems')
      .select('*')
      .eq('id', id)
      .limit(1)
      .returns<Problem[]>();

    if (error) {
      setEditorState({ status: 'error', message: toUserMessage(error) });
      return;
    }

    const problem = data?.[0];
    if (!problem) {
      setEditorState({ status: 'missing' });
      return;
    }

    setTitle(problem.title);
    setBody(problem.body);
    setAnswersText(problem.answers.join('\n'));
    setIsPublished(problem.is_published);
    setOrderIndex(String(problem.order_index));
    setEditorState({ status: 'ready' });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 200) {
      setSaveError('제목은 1~200자로 입력해 주세요.');
      return;
    }

    const answers = parseAnswers(answersText);
    if (answers.length < 1) {
      setSaveError('정답을 최소 1개 입력해 주세요.');
      return;
    }
    if (answers.length > 20) {
      setSaveError('정답은 최대 20개까지 등록할 수 있습니다.');
      return;
    }

    const parsedOrderIndex = Number.parseInt(orderIndex, 10);
    if (!Number.isInteger(parsedOrderIndex)) {
      setSaveError('순서는 정수로 입력해 주세요.');
      return;
    }

    setIsSaving(true);

    if (isNew) {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) {
        setIsSaving(false);
        setSaveError(toUserMessage(userError ?? new Error('로그인 정보를 확인할 수 없습니다.')));
        return;
      }

      const { error } = await supabase.from('problems').insert({
        title: trimmedTitle,
        body,
        answers,
        is_published: isPublished,
        order_index: parsedOrderIndex,
        created_by: userResult.user.id,
      });

      setIsSaving(false);
      if (error) {
        setSaveError(toUserMessage(error));
        return;
      }
      navigate('/teacher');
      return;
    }

    if (!id) {
      setIsSaving(false);
      setSaveError('문제 주소가 올바르지 않습니다.');
      return;
    }

    const { error } = await supabase
      .from('problems')
      .update({
        title: trimmedTitle,
        body,
        answers,
        is_published: isPublished,
        order_index: parsedOrderIndex,
      })
      .eq('id', id);

    setIsSaving(false);
    if (error) {
      setSaveError(toUserMessage(error));
      return;
    }
    navigate('/teacher');
  }

  return (
    <Layout>
      <Link to="/teacher" className="text-sm text-slate-500 hover:text-slate-800">
        ← 문제 관리
      </Link>
      <h1 className="mt-2 text-xl font-bold text-slate-900">{isNew ? '새 문제 등록' : '문제 수정'}</h1>

      {editorState.status === 'loading' && <p className="mt-4 text-slate-500">불러오는 중입니다…</p>}

      {editorState.status === 'error' && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{editorState.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {editorState.status === 'missing' && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          문제를 찾을 수 없습니다. 이미 삭제된 문제일 수 있습니다.
        </p>
      )}

      {editorState.status === 'ready' && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label htmlFor="title" className="block text-sm font-medium text-slate-700">
              제목 (문제 질문)
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />

            <label htmlFor="body" className="mt-4 block text-sm font-medium text-slate-700">
              본문 (선택)
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-xs text-slate-500">줄바꿈은 그대로 보입니다. 서식 없는 순수 텍스트입니다.</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label htmlFor="answers" className="block text-sm font-medium text-slate-700">
              정답
            </label>
            <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{ANSWER_GUIDE}</p>
            <textarea
              id="answers"
              value={answersText}
              onChange={(event) => setAnswersText(event.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={'서울\n서울특별시\nseoul'}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-xs text-slate-500">
              현재 {parseAnswers(answersText).length}개 / 최대 20개
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label htmlFor="orderIndex" className="block text-sm font-medium text-slate-700">
              순서
            </label>
            <input
              id="orderIndex"
              type="number"
              value={orderIndex}
              onChange={(event) => setOrderIndex(event.target.value)}
              className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-xs text-slate-500">숫자가 작을수록 목록 위에 표시됩니다.</p>

            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(event) => setIsPublished(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              학생에게 공개
            </label>
          </div>

          {saveError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSaving ? '저장 중…' : '저장'}
            </button>
            <Link
              to="/teacher"
              className="rounded-md border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </Link>
          </div>
        </form>
      )}
    </Layout>
  );
}
