import { Routes, Route, Outlet } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { JobBoardPage } from "./pages/JobBoardPage";
import { ApplyPage } from "./pages/ApplyPage";
import { ResumePage } from "./pages/ResumePage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminCrawlSourceStatsPage } from "./pages/AdminCrawlSourceStatsPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { PageShell } from "./components/PageShell";

// Rendered once for every route (via the layout Route below) rather than
// per-page, so Header — and the search/filter/add-job controls it owns —
// stays mounted and visible across navigation instead of disappearing and
// remounting fresh on every page.
function RootLayout() {
  return (
    <PageShell>
      <Header />
      <Outlet />
      <Footer />
    </PageShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<JobBoardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/jobs/:urlId/apply"
          element={
            <ProtectedRoute>
              <ApplyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resume"
          element={
            <ProtectedRoute>
              <ResumePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/api-keys"
          element={
            <ProtectedRoute>
              <ApiKeysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <ApplicationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/crawl-sources/:sourceId"
          element={
            <AdminRoute>
              <AdminCrawlSourceStatsPage />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  );
}
