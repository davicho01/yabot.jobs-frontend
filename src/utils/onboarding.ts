import type { AiAccess, Application, Onboarding, OnboardingStepKey } from "../api/types";
import { BOARD_PATH } from "../routes";

export const GETTING_STARTED_PATH = "/getting-started";

type StepContent = {
  title: string;
  body: string;
  cta: { to: string; label: string };
};

// "5 free evaluations" / "1 free evaluation".
export function freeEvaluationsPhrase(count: number): string {
  return `${count} free evaluation${count === 1 ? "" : "s"}`;
}

function aiAccessBody(access: AiAccess): string {
  if (access.has_own_key) return "You're set: evaluations run on your own API key.";
  if (access.free_evaluations_remaining > 0) {
    return (
      `You have ${freeEvaluationsPhrase(access.free_evaluations_remaining)} on us, so there's nothing to set up ` +
      "yet. Add your own API key whenever you like for unlimited evaluations."
    );
  }
  if (access.free_trial_enabled) {
    return "You've used your free evaluations. Add your own AI API key to keep evaluating jobs.";
  }
  return (
    "Yabot Jobs uses an AI model to score your resume against each job. Add an API key from Anthropic, " +
    "OpenAI, Google, DeepSeek, or Mistral. It's only used for your own requests."
  );
}

export function stepContent(
  key: OnboardingStepKey,
  onboarding: Onboarding,
  latestApplication: Application | null,
): StepContent {
  switch (key) {
    case "resume":
      return {
        title: "Upload your resume",
        body: "Every job gets scored against it. A PDF or Word file works.",
        cta: { to: "/resume", label: "Upload resume" },
      };
    case "ai_access":
      return {
        title: "Set up AI access",
        body: aiAccessBody(onboarding.ai_access),
        cta: { to: "/api-keys", label: onboarding.ai_access.has_own_key ? "Manage keys" : "Add an API key" },
      };
    case "application":
      return {
        title: "Pick a job to apply for",
        body: "Find a job on the board and click Apply →. It's saved to My applications, where you work through it step by step.",
        cta: { to: BOARD_PATH, label: "Browse jobs" },
      };
    case "evaluation":
      return {
        title: "Get your first job evaluation",
        body: "On the job's apply page, click Score this resume to see how well you match and which skills are missing.",
        cta: latestApplication
          ? {
              to: `/jobs/${latestApplication.job_posting.url_id}/apply`,
              label: `Open ${latestApplication.job_posting.title ?? "your application"}`,
            }
          : { to: BOARD_PATH, label: "Browse jobs" },
      };
  }
}

export function latestOf(applications: Application[] | undefined): Application | null {
  if (!applications || applications.length === 0) return null;
  return [...applications].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
