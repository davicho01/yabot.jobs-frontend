import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { applicationsApi } from "../api/applications";
import { useDismissOnboarding, useOnboarding } from "../hooks/useOnboarding";
import { latestOf, stepContent } from "../utils/onboarding";
import { BOARD_PATH } from "../routes";
import "./GettingStartedPage.css";

// The full walkthrough behind the getting-started banner: resume → AI
// access → first application → first evaluation. Each step's done-ness comes
// from GET /onboarding, so this page never has to be told a step happened.
export function GettingStartedPage() {
  const onboardingQuery = useOnboarding();
  const dismissMutation = useDismissOnboarding();
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: applicationsApi.list });
  const onboarding = onboardingQuery.data;

  if (onboardingQuery.isLoading) {
    return (
      <main className="getting-started-page">
        <p className="getting-started-page__intro">Loading…</p>
      </main>
    );
  }
  if (!onboarding) {
    return (
      <main className="getting-started-page">
        <p className="getting-started-page__intro">Couldn't load your progress. Try refreshing the page.</p>
      </main>
    );
  }

  const latestApplication = latestOf(applicationsQuery.data);
  const nextKey = onboarding.steps.find((step) => !step.done)?.key;
  const allDone = !nextKey;

  return (
    <main className="getting-started-page">
      <h1>{allDone ? "You're all set" : "Getting started"}</h1>
      <p className="getting-started-page__intro">
        {allDone
          ? "You've scored your resume against a job. From here: tailor your resume, write a cover letter, and track the application, all from its apply page."
          : "Four steps from signing up to knowing how well you fit a job. It takes about five minutes."}
      </p>

      <ol className="getting-started-steps">
        {onboarding.steps.map((step, index) => {
          const content = stepContent(step.key, onboarding, latestApplication);
          const isNext = step.key === nextKey;
          return (
            <li
              key={step.key}
              className={`getting-started-step${step.done ? " is-done" : ""}${isNext ? " is-next" : ""}`}
            >
              <span className="getting-started-step__marker" aria-hidden="true">
                {step.done ? "✓" : index + 1}
              </span>
              <div className="getting-started-step__body">
                <h2>
                  {content.title}
                  {step.done && <span className="visually-hidden"> (done)</span>}
                </h2>
                <p>{content.body}</p>
                {(isNext || (step.key === "ai_access" && !onboarding.ai_access.has_own_key)) && (
                  <Link
                    to={content.cta.to}
                    className={`getting-started-step__cta${isNext ? "" : " getting-started-step__cta--secondary"}`}
                  >
                    {content.cta.label} →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="getting-started-page__footer">
        {allDone ? (
          <Link to={BOARD_PATH} className="getting-started-step__cta">
            Back to the job board →
          </Link>
        ) : (
          !onboarding.dismissed_at && (
            <button
              type="button"
              className="getting-started-page__dismiss"
              disabled={dismissMutation.isPending}
              onClick={() => dismissMutation.mutate()}
            >
              I'll explore on my own. Hide the guide.
            </button>
          )
        )}
      </div>
    </main>
  );
}
