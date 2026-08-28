import { Navigate, Route, Routes } from 'react-router-dom';
import RequireStudent from './components/RequireStudent';
import RequireTeacher from './components/RequireTeacher';
import StudentStart from './pages/StudentStart';
import SeasonList from './pages/SeasonList';
import ProblemList from './pages/ProblemList';
import ProblemSolve from './pages/ProblemSolve';
import MyProgress from './pages/MyProgress';
import TeacherLogin from './pages/TeacherLogin';
import TeacherSeasons from './pages/TeacherSeasons';
import TeacherProblems from './pages/TeacherProblems';
import TeacherStudents from './pages/TeacherStudents';
import TeacherProblemEdit from './pages/TeacherProblemEdit';
import TeacherStats from './pages/TeacherStats';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentStart />} />

      <Route element={<RequireStudent />}>
        <Route path="/seasons" element={<SeasonList />} />
        <Route path="/seasons/:seasonId" element={<ProblemList />} />
        <Route path="/problems/:id" element={<ProblemSolve />} />
        {/* 시즌이 생기기 전에 공유된 주소가 있을 수 있다. */}
        <Route path="/problems" element={<Navigate to="/seasons" replace />} />
        <Route path="/me" element={<MyProgress />} />
      </Route>

      <Route path="/teacher/login" element={<TeacherLogin />} />
      <Route element={<RequireTeacher />}>
        <Route path="/teacher" element={<TeacherProblems />} />
        <Route path="/teacher/seasons" element={<TeacherSeasons />} />
        <Route path="/teacher/problems/:id" element={<TeacherProblemEdit />} />
        <Route path="/teacher/students" element={<TeacherStudents />} />
        <Route path="/teacher/stats" element={<TeacherStats />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
