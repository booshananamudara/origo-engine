import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AuthGuard } from "./auth/AuthGuard";
import { LoginPage } from "./auth/LoginPage";
import { ChangePasswordPage } from "./auth/ChangePasswordPage";
import { DashboardLayout } from "./components/DashboardLayout";
import { DashboardHome } from "./components/DashboardHome";
import { RunDetailPage } from "./components/RunDetailPage";
import { RunHistoryPage } from "./components/RunHistoryPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="runs" element={<RunHistoryPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
