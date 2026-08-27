import { Navigate, Outlet } from 'react-router-dom';
import { useStudent } from '../lib/session';

/** 학생 세션이 없으면 시작 화면으로 보낸다. */
export default function RequireStudent() {
  const student = useStudent();
  if (!student) return <Navigate to="/" replace />;
  return <Outlet />;
}
