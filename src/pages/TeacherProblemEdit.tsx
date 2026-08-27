import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { MathText } from '../components/MathText';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { IMAGE_ACCEPT, problemImageUrl, removeProblemImage, uploadProblemImage } from '../lib/images';
import type { Problem, Season } from '../lib/types';

/** 기존 문제를 불러오는 동안의 상태. 새 문제는 불러올 것이 없으므로 곧바로 ready. */
type EditorState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready' };

const ANSWER_GUIDE =
  "정답은 한 줄에 하나씩. 대소문자와 앞뒤 공백은 무시되지만 '10'과 '십'은 다르게 처리되니 표기 변형을 모두 적어주세요";

const MATH_GUIDE =
  '수식은 달러 기호로 감쌉니다. 문장 안에 넣으려면 $x^2-4x+3$ 처럼, 가운데 크게 넣으려면 $$\\frac{a}{b}$$ 처럼 씁니다. 달러 기호 자체를 쓰려면 \\$ 로 적으세요.';

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
  const [searchParams] = useSearchParams();

  const [editorState, setEditorState] = useState<EditorState>(isNew ? { status: 'ready' } : { status: 'loading' });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [answersText, setAnswersText] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [orderIndex, setOrderIndex] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  /**
   * 화면에서 치웠지만 저장소에는 아직 남아 있는 파일들.
   * 저장에 성공한 뒤에 지운다 — 저장을 취소하고 나가면 DB 는 옛 경로를 가리키고 있으므로,
   * 미리 지워버리면 멀쩡한 문제의 그림이 깨진다.
   */
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setEditorState({ status: 'loading' });

    const seasonsResult = await supabase
      .from('seasons')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<Season[]>();

    if (seasonsResult.error) {
      setEditorState({ status: 'error', message: toUserMessage(seasonsResult.error) });
      return;
    }
    const seasonList = seasonsResult.data ?? [];
    setSeasons(seasonList);

    if (!id || id === 'new') {
      // 목록에서 시즌을 걸러 보던 중이었다면 그 시즌을 골라둔다.
      const requested = searchParams.get('season');
      const preselected = seasonList.find((season) => season.id === requested) ?? seasonList[0];
      setSeasonId(preselected?.id ?? '');
      setEditorState({ status: 'ready' });
      return;
    }

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

    setSeasonId(problem.season_id);
    setTitle(problem.title);
    setBody(problem.body);
    setAnswersText(problem.answers.join('\n'));
    setIsPublished(problem.is_published);
    setOrderIndex(String(problem.order_index));
    setImagePath(problem.image_path ?? null);
    setEditorState({ status: 'ready' });
  }, [id, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change 가 발생하도록 입력값을 비워둔다.
    event.target.value = '';
    if (!file) return;

    setImageError(null);
    setIsUploading(true);
    const result = await uploadProblemImage(file);
    setIsUploading(false);

    if ('error' in result) {
      setImageError(result.error);
      return;
    }
    if (imagePath !== null) setPendingRemovals((paths) => [...paths, imagePath]);
    setImagePath(result.path);
  }

  function handleImageRemove(): void {
    if (imagePath === null) return;
    setPendingRemovals((paths) => [...paths, imagePath]);
    setImagePath(null);
    setImageError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);

    if (seasonId === '') {
      setSaveError('시즌을 선택해 주세요. 시즌이 없다면 먼저 "시즌 관리" 에서 만들어야 합니다.');
      return;
    }

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
        season_id: seasonId,
        title: trimmedTitle,
        body,
        answers,
        is_published: isPublished,
        order_index: parsedOrderIndex,
        created_by: userResult.user.id,
        image_path: imagePath,
      });

      setIsSaving(false);
      if (error) {
        setSaveError(toUserMessage(error));
        return;
      }
      await cleanUpReplacedImages();
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
        season_id: seasonId,
        title: trimmedTitle,
        body,
        answers,
        is_published: isPublished,
        order_index: parsedOrderIndex,
        image_path: imagePath,
      })
      .eq('id', id);

    setIsSaving(false);
    if (error) {
      setSaveError(toUserMessage(error));
      return;
    }
    await cleanUpReplacedImages();
    navigate('/teacher');
  }

  /** 저장이 끝난 뒤 아무도 참조하지 않게 된 파일들을 지운다. 실패해도 흐름을 막지 않는다. */
  async function cleanUpReplacedImages(): Promise<void> {
    await Promise.all(pendingRemovals.map((path) => removeProblemImage(path)));
    setPendingRemovals([]);
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
            <label htmlFor="season" className="block text-sm font-medium text-slate-700">
              시즌
            </label>
            {seasons.length === 0 ? (
              <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                시즌이 하나도 없습니다.{' '}
                <Link to="/teacher/seasons" className="font-medium underline">
                  시즌 관리
                </Link>
                에서 먼저 만들어 주세요.
              </p>
            ) : (
              <select
                id="season"
                value={seasonId}
                onChange={(event) => setSeasonId(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                    {season.is_published ? '' : ' (비공개 시즌)'}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-slate-500">
              공개된 시즌의 공개된 문제만 학생에게 보입니다. 시즌을 바꾸면 학생들의 제출 기록은 그대로 따라갑니다.
            </p>
          </div>

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
            <p className="mt-1 text-xs text-slate-500">줄바꿈은 그대로 보입니다.</p>
            <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">{MATH_GUIDE}</p>

            <p className="mt-4 text-sm font-medium text-slate-700">미리보기 (학생에게 보이는 모습)</p>
            <div className="mt-1 min-h-16 whitespace-pre-wrap rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-800">
              {title.trim().length === 0 && body.trim().length === 0 ? (
                <span className="text-slate-400">제목과 본문을 입력하면 여기에 나타납니다.</span>
              ) : (
                <>
                  {title.trim().length > 0 && (
                    <span className="block font-bold">
                      <MathText text={title} />
                    </span>
                  )}
                  {body.trim().length > 0 && <MathText text={body} />}
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700">그림 (선택)</p>
            <p className="mt-1 text-xs text-slate-500">
              그래프·도형 사진을 1장 붙일 수 있습니다. PNG · JPG · WEBP · GIF, 5MB 이하.
            </p>

            {imagePath !== null && (
              <figure className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                <img
                  src={problemImageUrl(imagePath)}
                  alt="올린 그림 미리보기"
                  className="mx-auto max-h-64 w-auto max-w-full"
                />
              </figure>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {imagePath === null ? '이미지 선택' : '다른 이미지로 교체'}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={isUploading}
                  onChange={(event) => void handleImageChange(event)}
                  className="hidden"
                />
              </label>
              {imagePath !== null && (
                <button
                  type="button"
                  onClick={handleImageRemove}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  이미지 삭제
                </button>
              )}
              {isUploading && <span className="text-sm text-slate-500">올리는 중…</span>}
            </div>

            {imageError !== null && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {imageError}
              </p>
            )}
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
