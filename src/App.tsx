import { useEffect } from "react";
import { Routes, Route, Outlet, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { BOARD_PATH } from "./routes";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { OAuthAuthorizePage } from "./pages/OAuthAuthorizePage";
import { JobBoardPage } from "./pages/JobBoardPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { JobSwipePage } from "./pages/JobSwipePage";
import { ApplyPage2 } from "./pages/ApplyPage2";
import { ProfilePage } from "./pages/ProfilePage";
import { ResumePage } from "./pages/ResumePage";
import { ResumeOptimizationPage } from "./pages/ResumeOptimizationPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { AccessTokensPage } from "./pages/AccessTokensPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { SavedSearchesPage } from "./pages/SavedSearchesPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminCrawlSourceStatsPage } from "./pages/AdminCrawlSourceStatsPage";
import { AdminJobsPage } from "./pages/AdminJobsPage";
import { AdminDuplicatesPage } from "./pages/AdminDuplicatesPage";
import { AdminFeedbackPage } from "./pages/AdminFeedbackPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { PageShell } from "./components/PageShell";
import { FeedbackProvider } from "./components/FeedbackModal";
import { SignInPromptProvider } from "./components/SignInModal";
import { GettingStartedBanner } from "./components/GettingStarted";
import { GETTING_STARTED_PATH } from "./utils/onboarding";
import { GettingStartedPage } from "./pages/GettingStartedPage";
import { HelpPage } from "./pages/HelpPage";
import { usePageViews } from "./hooks/usePageViews";
import { phoneSearchLayout, reportSearchLayoutExposure, useIsPhone } from "./utils/experiments";

// Rendered once for every route (via the layout Route below) rather than
// per-page, so Header — and the search/filter/add-job controls it owns —
// stays mounted and visible across navigation instead of disappearing and
// remounting fresh on every page.
function RootLayout() {
  return (
    <PageShell>
      <FeedbackProvider>
        <SignInPromptProvider>
          <Header />
          <GettingStartedBanner />
          <Outlet />
          <Footer />
        </SignInPromptProvider>
      </FeedbackProvider>
    </PageShell>
  );
}

// /job/<id> is the backend's static, crawlable page for a job, published into
// the bucket a couple of times a day. A job found since the last publish has
// no page yet, so the host hands the path to the app instead: show that job
// here rather than an empty route.
function StaticJobPageFallback() {
  const { urlId } = useParams<{ urlId: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/jobs/${urlId}${search}${hash}`} replace />;
}

// The board, or on a phone whichever side of the search layout test this
// visitor is on (see utils/experiments).
// Phones start on the list either way; a posting tapped there opens on a
// screen of its own (?view=posting), alone or swiping on through the
// results, by the visitor's side of the search layout test.
function BoardRoute() {
  const isPhone = useIsPhone();
  const [searchParams] = useSearchParams();
  const layout = isPhone ? phoneSearchLayout() : null;
  useEffect(() => {
    if (layout) reportSearchLayoutExposure(layout);
  }, [layout]);
  if (layout && searchParams.get("view") === "posting") {
    return <JobSwipePage mode={layout === "swipe" ? "swipe" : "single"} />;
  }
  return <JobBoardPage variant="cards" />;
}

export default function App() {
  usePageViews();

  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path={BOARD_PATH} element={<BoardRoute />} />
        <Route path="/jobs/:urlId" element={<JobDetailPage />} />
        <Route path="/job/:urlId" element={<StaticJobPageFallback />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/help" element={<HelpPage />} />
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
              <ApplyPage2 />
            </ProtectedRoute>
          }
        />
        <Route
          path={GETTING_STARTED_PATH}
          element={
            <ProtectedRoute>
              <GettingStartedPage />
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
          path="/access-tokens"
          element={
            <ProtectedRoute>
              <AccessTokensPage />
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
          path="/resume-optimization"
          element={
            <ProtectedRoute>
              <ResumeOptimizationPage />
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
        <Route
          path="/admin/duplicates"
          element={
            <AdminRoute>
              <AdminDuplicatesPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/feedback"
          element={
            <AdminRoute>
              <AdminFeedbackPage />
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
