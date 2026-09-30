import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AI_ACCESS_QUERY_KEY, onboardingApi } from "../api/onboarding";
import { freeEvaluationsPhrase } from "../utils/onboarding";
import "./FreeEvaluationNote.css";

// Shown next to the Apply page's Score button for someone on the free trial
// (no AI API key of their own): how many free evaluations are left, and
// where to go for unlimited ones. Renders nothing for anyone with a key, or
// when the trial is off.
export function FreeEvaluationNote() {
  const { data: access } = useQuery({ queryKey: AI_ACCESS_QUERY_KEY, queryFn: onboardingApi.aiAccess });
  if (!access || access.has_own_key || !access.free_trial_enabled) return null;

  if (access.free_evaluations_remaining > 0) {
    return (
      <p className="free-evaluation-note">
        Scoring uses 1 of your {freeEvaluationsPhrase(access.free_evaluations_remaining)} left.{" "}
        <Link to="/api-keys">Add your own AI API key</Link> for unlimited evaluations.
      </p>
    );
  }
  return (
    <p className="free-evaluation-note free-evaluation-note--empty">
      You've used all {freeEvaluationsPhrase(access.free_evaluation_limit)}.{" "}
      <Link to="/api-keys">Add your own AI API key</Link> to keep scoring jobs. It takes about two minutes.
    </p>
  );
}
