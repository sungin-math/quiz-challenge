import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { clearStudent, displayName, setStudent, useStudent } from '../lib/session';

export default function StudentStart() {
  const student = useStudent();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (trimmedName === '') {
      setErrorMessage('이름을 입력해 주세요.');
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      setErrorMessage('비밀번호는 숫자 4자리입니다.');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.rpc('student_login', {
      p_name: trimmedName,
      p_password: password,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(toUserMessage(error));
      return;
    }

    // 실패도 정상 응답으로 온다. ok 가 false 면 message 가 그대로 보여줄 문구다.
    const result = data?.[0];
    if (!result) {
      setErrorMessage('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!result.ok || !result.student_id || !result.student_name) {
      setPassword('');
      setErrorMessage(result.message || '이름 또는 비밀번호가 올바르지 않습니다.');
      return;
    }

    try {
      setStudent({ id: result.student_id, name: result.student_name });
    } catch (storageError) {
      setErrorMessage(toUserMessage(storageError));
      return;
    }
    navigate('/seasons');
  }

  return (
    <Layout>
      <div className="mx-auto max-w-sm space-y-6">
        {/* 첫 화면에서만 로고를 크게 보여준다. 나머지 화면은 헤더의 작은 로고로 충분하다. */}
        <section className="rounded-2xl border border-stone-200 bg-white px-6 py-8 text-center">
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            className="mx-auto h-20 w-20"
            width={1330}
            height={1330}
          />
          <h1 className="mt-4 text-2xl font-bold text-stone-900">문제풀이 챌린지</h1>
          <p className="mt-1 text-sm font-medium text-brand-700">강성인 수학</p>
          <p className="mx-auto mt-3 text-sm text-stone-600">
            선생님께 받은 이름과 비밀번호로 로그인하세요. 답을 제출하면 즉시 채점됩니다.
          </p>
        </section>

        {errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {student ? (
          <section className="rounded-lg border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm text-brand-900">
              <span className="font-semibold">{displayName(student)}</span> 님으로 로그인되어 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/seasons"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                이어서 풀기
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearStudent();
                  setName('');
                  setPassword('');
                  setErrorMessage(null);
                }}
                className="rounded-md border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                로그아웃
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleLogin} className="rounded-lg border border-stone-200 bg-white p-4">
            <label htmlFor="name" className="block text-sm font-medium text-stone-700">
              이름
            </label>
            {/*
              autoComplete 을 username/current-password 로 두면 크롬이 같은 주소에 저장해 둔
              "선생님 로그인" 자격 증명을 이 칸에 채워 넣는다 (이름 칸에 선생님 이메일이 들어갔다).
              학생 비밀번호는 숫자 4자리라 브라우저 비밀번호 관리자에 넣을 것도 아니므로,
              이름은 off, 비밀번호는 one-time-code 로 저장된 자격 증명과 엮이지 않게 한다.
            */}
            <input
              id="name"
              name="studentName"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={20}
              autoComplete="off"
              placeholder="예: 김민수"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />

            <label htmlFor="password" className="mt-3 block text-sm font-medium text-stone-700">
              비밀번호
            </label>
            <input
              id="password"
              name="studentPin"
              type="password"
              value={password}
              // 숫자만 남긴다. 휴대폰에서도 숫자 자판이 바로 뜨도록 inputMode 를 준다.
              onChange={(event) => setPassword(event.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              placeholder="숫자 4자리"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-base tracking-[0.4em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <p className="mt-1 text-xs text-stone-500">
              계정은 선생님이 만들어 둡니다. 로그인이 안 되면 선생님께 문의해 주세요.
            </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-3 w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isSubmitting ? '로그인 중…' : '로그인'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-stone-400">
          <Link to="/teacher/login" className="hover:text-stone-600">
            선생님 로그인
          </Link>
        </p>
      </div>
    </Layout>
  );
}
