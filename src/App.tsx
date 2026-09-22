import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import { BOARD_PATH } from "./routes";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { OAuthAuthorizePage } from "./pages/OAuthAuthorizePage";
import { JobBoardPage } from "./pages/JobBoardPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { ApplyPage } from "./pages/ApplyPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ResumePage } from "./pages/ResumePage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { SavedSearchesPage } from "./pages/SavedSearchesPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminCrawlSourceStatsPage } from "./pages/AdminCrawlSourceStatsPage";
import { AdminJobsPage } from "./pages/AdminJobsPage";
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
        <Route path={BOARD_PATH} element={<JobBoardPage />} />
        <Route path="/jobs/:urlId" element={<JobDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/oauth/authorize"
          element={
            <ProtectedRoute>
              <OAuthAuthorizePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:urlId/apply"
          element={
            <ProtectedRoute>
              <ApplyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
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
          path="/saved-searches"
          element={
            <ProtectedRoute>
              <SavedSearchesPage />
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
        <Route
          path="/admin/jobs"
          element={
            <AdminRoute>
              <AdminJobsPage />
            </AdminRoute>
          }
        />
        {/* "/" is the landing page (a separate static page), so anything else the
            app doesn't know lands on the board instead of a blank screen. */}
        <Route path="*" element={<Navigate to={BOARD_PATH} replace />} />
      </Route>
    </Routes>
  );
}
