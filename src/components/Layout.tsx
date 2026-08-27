import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { displayName, useStudent } from '../lib/session';

interface LayoutProps {
  children: ReactNode;
}

/** 모든 화면이 공유하는 헤더 + 가운데 정렬 컨테이너. */
export default function Layout({ children }: LayoutProps) {
  const student = useStudent();
  const { pathname } = useLocation();
  const isTeacherArea = pathname.startsWith('/teacher');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link
            to={isTeacherArea ? '/teacher' : '/'}
            className="text-base font-bold text-slate-900 sm:text-lg"
          >
            문제풀이 챌린지
            {isTeacherArea && <span className="ml-2 text-sm font-medium text-indigo-600">관리자</span>}
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            {isTeacherArea ? (
              <>
                <Link to="/teacher" className="text-slate-600 hover:text-slate-900">
                  문제 관리
                </Link>
                <Link to="/teacher/stats" className="text-slate-600 hover:text-slate-900">
                  통계
                </Link>
              </>
            ) : (
              student && (
                <>
                  <Link to="/problems" className="text-slate-600 hover:text-slate-900">
                    문제 목록
                  </Link>
                  <Link to="/me" className="text-slate-600 hover:text-slate-900">
                    내 기록
                  </Link>
                  <span className="hidden text-slate-400 sm:inline">{displayName(student)}</span>
                </>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
