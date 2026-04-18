import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import Courses from './pages/Courses';
import Classes from './pages/Classes';
import Sessions from './pages/Sessions';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Dashboard from './pages/Dashboard';
import Azota from './pages/Azota';
import AzotaExamResult from './pages/AzotaExamResult';
import SCM from './pages/SCM';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/courses" replace />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/students" element={<Students />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/azota-exam-result" element={<AzotaExamResult />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/azota" element={<Azota />} />
        <Route path="/scm" element={<SCM />} />
      </Routes>
    </Layout>
  );
}
