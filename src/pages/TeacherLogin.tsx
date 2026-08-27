import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';

export default function TeacherLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(toUserMessage(error));
      return;
    }

    // 로그인은 됐지만 teachers 에 등록되지 않은 계정이면 바로 로그아웃시킨다.
    const { data: rows, error: teacherError } = await supabase
      .from('teachers')
      .select('id')
      .eq('id', data.user.id)
      .limit(1)
      .returns<{ id: string }[]>();

    if (teacherError) {
      setIsSubmitting(false);
      setErrorMessage(toUserMessage(teacherError));
      return;
    }

    if (!rows || rows.length === 0) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setErrorMessage(
        '관리자로 등록되지 않은 계정입니다. supabase/04_seed.sql 로 teachers 테이블에 계정을 등록했는지 확인해 주세요.',
      );
      return;
    }

    setIsSubmitting(false);
    navigate('/teacher', { replace: true });
  }

  return (
    <Layout>
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-bold text-slate-900">선생님 로그인</h1>
        <p className="mt-1 text-sm text-slate-600">Supabase에 등록한 관리자 계정으로 로그인하세요.</p>

        <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />

          <label htmlFor="password" className="mt-3 block text-sm font-medium text-slate-700">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        {errorMessage && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link to="/" className="hover:text-slate-600">
            학생 화면으로
          </Link>
        </p>
      </div>
    </Layout>
  );
}
