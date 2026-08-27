import { Navigate, Route, Routes } from 'react-router-dom';
import RequireStudent from './components/RequireStudent';
import RequireTeacher from './components/RequireTeacher';
import StudentStart from './pages/StudentStart';
import ProblemList from './pages/ProblemList';
import ProblemSolve from './pages/ProblemSolve';
import MyProgress from './pages/MyProgress';
import TeacherLogin from './pages/TeacherLogin';
import TeacherProblems from './pages/TeacherProblems';
import TeacherProblemEdit from './pages/TeacherProblemEdit';
import TeacherStats from './pages/TeacherStats';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentStart />} />

      <Route element={<RequireStudent />}>
        <Route path="/problems" element={<ProblemList />} />
        <Route path="/problems/:id" element={<ProblemSolve />} />
        <Route path="/me" element={<MyProgress />} />
      </Route>

      <Route path="/teacher/login" element={<TeacherLogin />} />
      <Route element={<RequireTeacher />}>
        <Route path="/teacher" element={<TeacherProblems />} />
        <Route path="/teacher/problems/:id" element={<TeacherProblemEdit />} />
        <Route path="/teacher/stats" element={<TeacherStats />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
