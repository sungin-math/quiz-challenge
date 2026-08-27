import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { clearStudent, displayName, isValidStudentCode, setStudent, useStudent } from '../lib/session';

export default function StudentStart() {
  const student = useStudent();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState('');
  const [resumeCode, setResumeCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStart(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      setErrorMessage('이름은 1~20자로 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    // start_session 은 students.id(uuid) 하나를 돌려준다.
    const { data, error } = await supabase.rpc('start_session', { p_nickname: trimmed });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(toUserMessage(error));
      return;
    }
    if (typeof data !== 'string' || !isValidStudentCode(data)) {
      setErrorMessage('시작에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    try {
      setStudent({ id: data, nickname: trimmed });
    } catch (storageError) {
      setErrorMessage(toUserMessage(storageError));
      return;
    }
    navigate('/seasons');
  }

  function handleResume(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrorMessage(null);

    const trimmed = resumeCode.trim();
    if (!isValidStudentCode(trimmed)) {
      setErrorMessage('이어하기 코드 형식이 올바르지 않습니다. 내 기록 화면에서 복사한 코드를 붙여넣어 주세요.');
      return;
    }

    try {
      // 이 코드로 실제 기록이 있는지는 첫 제출 때 서버가 확인해 준다.
      setStudent({ id: trimmed.toLowerCase(), nickname: null });
    } catch (storageError) {
      setErrorMessage(toUserMessage(storageError));
      return;
    }
    navigate('/seasons');
  }

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <h1 className="text-2xl font-bold text-slate-900">문제풀이 챌린지</h1>
          <p className="mt-1 text-sm text-slate-600">
            이름만 입력하면 바로 시작할 수 있습니다. 답을 제출하면 즉시 채점됩니다.
          </p>
        </section>

        {errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {student && (
          <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-sm text-indigo-900">
              <span className="font-semibold">{displayName(student)}</span> 님의 진행 기록이 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/seasons"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                이어서 풀기
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearStudent();
                  setNickname('');
                  setErrorMessage(null);
                }}
                className="rounded-md border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                다른 이름으로 시작
              </button>
            </div>
          </section>
        )}

        {!student && (
          <form onSubmit={handleStart} className="rounded-lg border border-slate-200 bg-white p-4">
            <label htmlFor="nickname" className="block text-sm font-medium text-slate-700">
              이름
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              autoComplete="off"
              placeholder="예: 김민수"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-xs text-slate-500">1~20자. 같은 이름이 있어도 괜찮습니다.</p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-3 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? '시작하는 중…' : '시작하기'}
            </button>
          </form>
        )}

        <details className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            이어하기 코드가 있나요?
          </summary>
          <form onSubmit={handleResume} className="mt-3">
            <p className="text-xs text-slate-500">
              전에 쓰던 기기의 <span className="font-medium">내 기록</span> 화면에서 복사한 코드를 붙여넣으면
              풀던 기록을 그대로 이어갈 수 있습니다.
            </p>
            <input
              type="text"
              value={resumeCode}
              onChange={(event) => setResumeCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              코드로 이어하기
            </button>
          </form>
        </details>

        <p className="text-center text-xs text-slate-400">
          <Link to="/teacher/login" className="hover:text-slate-600">
            선생님 로그인
          </Link>
        </p>
      </div>
    </Layout>
  );
}
