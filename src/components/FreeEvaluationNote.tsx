import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AI_ACCESS_QUERY_KEY, onboardingApi } from "../api/onboarding";
import { freeEvaluationsPhrase } from "../utils/onboarding";
import "./FreeEvaluationNote.css";

// Shown on a job's Apply page for someone on the free trial (no AI API key
// or plan): whether this job is already unlocked by a free evaluation (then
// every AI feature for it is included), how many are left for new jobs, and
// where to go for unlimited use. Renders nothing for anyone with a key or a
// plan, or when the trial is off.
export function FreeEvaluationNote({ jobPostingId }: { jobPostingId: string | undefined }) {
  const { data: access } = useQuery({ queryKey: AI_ACCESS_QUERY_KEY, queryFn: onboardingApi.aiAccess });
  if (!access || access.has_own_key || access.subscribed || !access.free_trial_enabled) return null;
  const orSubscribe = access.subscription_available ? `, or subscribe for ${access.subscription_price_label},` : "";

  if (jobPostingId && access.free_trial_job_ids.includes(jobPostingId)) {
    return (
      <p className="free-evaluation-note">
        This job is unlocked with a free evaluation: scoring, tailoring, the cover letter, and interview prep are all
        included.
      </p>
    );
  }
  if (access.free_evaluations_remaining > 0) {
    return (
      <p className="free-evaluation-note">
        Your first AI step on this job uses 1 of your {freeEvaluationsPhrase(access.free_evaluations_remaining)}{" "}
        left and unlocks everything for it: scoring, tailoring, the cover letter, and interview prep.{" "}
        <Link to="/api-keys">Add your own AI API key</Link>
        {orSubscribe} for unlimited jobs.
      </p>
    );
  }
  return (
    <p className="free-evaluation-note free-evaluation-note--empty">
      You've used all {freeEvaluationsPhrase(access.free_evaluation_limit)}.{" "}
      <Link to="/api-keys">Add your own AI API key</Link>
      {orSubscribe} to use AI on more jobs.
    </p>
  );
}
