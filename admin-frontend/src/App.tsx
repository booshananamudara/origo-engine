import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth/AuthGuard";
import { LoginPage } from "./auth/LoginPage";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ClientList } from "./components/clients/ClientList";
import { ClientDetail } from "./components/clients/ClientDetail";
import { ClientOverview } from "./components/clients/ClientOverview";
import { ClientPrompts } from "./components/clients/ClientPrompts";
import { ClientCompetitors } from "./components/clients/ClientCompetitors";
import { ClientKnowledgeBase } from "./components/clients/ClientKnowledgeBase";
import { ClientRuns } from "./components/clients/ClientRuns";
import { ClientSettings } from "./components/clients/ClientSettings";
import { RunDetail } from "./components/clients/RunDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <AuthGuard>
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/clients" replace />} />
        <Route path="/clients" element={<ClientList />} />

        <Route path="/clients/:clientId" element={<ClientDetail />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ClientOverview />} />
          <Route path="prompts" element={<ClientPrompts />} />
          <Route path="competitors" element={<ClientCompetitors />} />
          <Route path="knowledge-base" element={<ClientKnowledgeBase />} />
          <Route path="runs" element={<ClientRuns />} />
          <Route path="settings" element={<ClientSettings />} />
        </Route>

        {/* RunDetail is outside ClientDetail tabs — full-page layout */}
        <Route path="/clients/:clientId/runs/:runId" element={<RunDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  );
}
