import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { applicationsApi } from "../api/applications";
import { useDismissOnboarding, useOnboarding } from "../hooks/useOnboarding";
import { GETTING_STARTED_PATH, latestOf, stepContent } from "../utils/onboarding";
import { BOARD_PATH } from "../routes";
import "./GettingStarted.css";

// Sign-in pages: nobody's signed in there yet, so there's nothing to show.
const HIDDEN_ON = ["/login", "/auth/", "/oauth/"];

// Slim strip under the header on every page for a new account until they
// close it: progress and the one next thing to do while getting started is
// open, then — rather than vanishing the moment the last step is done — a
// success message pointing them on to more jobs, until they close that too.
export function GettingStartedBanner() {
  const location = useLocation();
  const onboardingQuery = useOnboarding();
  const dismissMutation = useDismissOnboarding();
  const onboarding = onboardingQuery.data;
  const allDone = !!onboarding && (!!onboarding.completed_at || onboarding.steps.every((step) => step.done));
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
    enabled: !!onboarding && !allDone && !onboarding.dismissed_at,
  });

  if (!onboarding || onboarding.dismissed_at) return null;
  if (HIDDEN_ON.some((prefix) => location.pathname.startsWith(prefix))) return null;

  const closeButton = (
    <button
      type="button"
      className="getting-started-banner__close"
      aria-label={allDone ? "Close" : "Hide getting started"}
      title={allDone ? "Close" : "Hide. The guide stays in the account menu under Getting started."}
      disabled={dismissMutation.isPending}
      onClick={() => dismissMutation.mutate()}
    >
      ×
    </button>
  );

  if (allDone) {
    return (
      <aside className="getting-started-banner getting-started-banner--done" aria-label="Getting started" role="status">
        <div className="getting-started-banner__progress">
          <span className="getting-started-banner__check" aria-hidden="true">
            ✓
          </span>
          <span className="getting-started-banner__title">You're all set</span>
          <span className="getting-started-banner__count">Getting started complete</span>
        </div>
        <div className="getting-started-banner__next">
          <span className="getting-started-banner__next-label">Keep going: apply to more jobs</span>
          <Link to={BOARD_PATH} className="getting-started-banner__cta">
            Browse jobs →
          </Link>
          {closeButton}
        </div>
      </aside>
    );
  }

  const doneCount = onboarding.steps.filter((step) => step.done).length;
  const nextStep = onboarding.steps.find((step) => !step.done)!;
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
        {/* The step title as written — lowercasing it turned "AI" into "ai". */}
        <span className="getting-started-banner__next-label">Next: {next.title}</span>
        <Link to={next.cta.to} className="getting-started-banner__cta">
          {next.cta.label} →
        </Link>
        {closeButton}
      </div>
    </aside>
  );
}
