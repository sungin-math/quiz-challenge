import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearStudent, displayName, useStudent } from '../lib/session';

interface LayoutProps {
  children: ReactNode;
}

/** 모든 화면이 공유하는 헤더 + 가운데 정렬 컨테이너. */
export default function Layout({ children }: LayoutProps) {
  const student = useStudent();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isTeacherArea = pathname.startsWith('/teacher');

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link
            to={isTeacherArea ? '/teacher' : '/'}
            className="flex items-center gap-2.5"
            aria-label="강성인 수학 문제풀이 챌린지"
          >
            {/* 로고가 브랜드명을 이미 담고 있으므로 옆에는 서비스 이름만 붙인다. */}
            <img
              src="/logo-horizontal.png"
              alt="강성인 수학"
              className="h-8 w-auto sm:h-10"
              width={2103}
              height={837}
            />
            <span className="hidden h-5 w-px bg-stone-200 sm:block" />
            <span className="hidden text-sm font-medium text-stone-600 sm:block">문제풀이 챌린지</span>
            {isTeacherArea && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                관리자
              </span>
            )}
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            {isTeacherArea ? (
              <>
                <Link to="/teacher" className="text-stone-600 hover:text-brand-700">
                  문제 관리
                </Link>
                <Link to="/teacher/seasons" className="text-stone-600 hover:text-brand-700">
                  시즌 관리
                </Link>
                <Link to="/teacher/students" className="text-stone-600 hover:text-brand-700">
                  학생 관리
                </Link>
                <Link to="/teacher/stats" className="text-stone-600 hover:text-brand-700">
                  통계
                </Link>
              </>
            ) : (
              student && (
                <>
                  <Link to="/seasons" className="text-stone-600 hover:text-brand-700">
                    시즌 목록
                  </Link>
                  <Link to="/me" className="text-stone-600 hover:text-brand-700">
                    내 기록
                  </Link>
                  <span className="hidden text-stone-400 sm:inline">{displayName(student)}</span>
                  {/* 교실 공용 기기에서 다음 학생에게 넘길 수 있어야 한다. */}
                  <button
                    type="button"
                    onClick={() => {
                      clearStudent();
                      navigate('/', { replace: true });
                    }}
                    className="text-stone-400 hover:text-brand-700"
                  >
                    로그아웃
                  </button>
                </>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-4">
        <p className="text-center text-xs text-stone-400">강성인 수학 · KANGSUNGINMATH</p>
      </footer>
    </div>
  );
}
