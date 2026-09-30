import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { applicationsApi } from "../api/applications";
import { useDismissOnboarding, useOnboarding } from "../hooks/useOnboarding";
import { GETTING_STARTED_PATH, latestOf, stepContent } from "../utils/onboarding";
import "./GettingStarted.css";

// Pages where a "finish setting up" nudge would be noise: the walkthrough
// itself, sign-in, and admin.
const HIDDEN_ON = [GETTING_STARTED_PATH, "/login", "/auth/", "/oauth/", "/admin"];

// Slim, dismissible strip under the header while the checklist is still
// open — shows progress and the one next thing to do.
export function GettingStartedBanner() {
  const location = useLocation();
  const onboardingQuery = useOnboarding();
  const dismissMutation = useDismissOnboarding();
  const onboarding = onboardingQuery.data;
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
    enabled: !!onboarding && !onboarding.completed_at && !onboarding.dismissed_at,
  });

  if (!onboarding || onboarding.completed_at || onboarding.dismissed_at) return null;
  if (HIDDEN_ON.some((prefix) => location.pathname.startsWith(prefix))) return null;

  const doneCount = onboarding.steps.filter((step) => step.done).length;
  const nextStep = onboarding.steps.find((step) => !step.done);
  if (!nextStep) return null;
  const next = stepContent(nextStep.key, onboarding, latestOf(applicationsQuery.data));

  return (
    <aside className="getting-started-banner" aria-label="Getting started">
      <div className="getting-started-banner__progress">
        <Link to={GETTING_STARTED_PATH} className="getting-started-banner__title">
          Getting started
        </Link>
        <span className="getting-started-banner__count">
          {doneCount} of {onboarding.steps.length} done
        </span>
        <span className="getting-started-banner__bar" aria-hidden="true">
          <span style={{ width: `${(doneCount / onboarding.steps.length) * 100}%` }} />
        </span>
      </div>
      <div className="getting-started-banner__next">
        <span className="getting-started-banner__next-label">Next: {next.title.toLowerCase()}</span>
        <Link to={next.cta.to} className="getting-started-banner__cta">
          {next.cta.label} →
        </Link>
        <button
          type="button"
          className="getting-started-banner__close"
          aria-label="Hide getting started"
          title="Hide. You can reopen it from the account menu."
          disabled={dismissMutation.isPending}
          onClick={() => dismissMutation.mutate()}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
