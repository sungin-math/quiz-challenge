import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { clearStudent, getStudent, setStudent, useStudent } from '../lib/session';

/**
 * 학생 세션이 없으면 로그인 화면으로 보낸다.
 *
 * localStorage 에 남아 있는 세션이 아직 쓸 수 있는지도 한 번 확인한다.
 * 계정이 지워졌거나 사용 중지됐으면 세션을 지우고, 이름이 바뀌었으면 새 이름으로 갱신한다.
 * 이 컴포넌트는 레이아웃 라우트라 학생 화면들을 오가는 동안 계속 떠 있으므로,
 * 확인은 앱을 열 때 한 번만 일어난다. 결과를 기다리지 않고 바로 화면을 그린다.
 */
export default function RequireStudent() {
  const student = useStudent();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    const current = getStudent();
    if (!current) return;
    checked.current = true;

    void (async () => {
      const { data, error } = await supabase.rpc('student_profile', { p_student_id: current.id });
      // 네트워크 문제로 확인하지 못한 경우에는 세션을 건드리지 않는다.
      if (error) return;

      const row = data?.[0];
      if (!row) {
        clearStudent();
        return;
      }
      if (row.student_name !== current.name) {
        setStudent({ id: row.student_id, name: row.student_name });
      }
    })();
  }, [student]);

  if (!student) return <Navigate to="/" replace />;
  return <Outlet />;
}
