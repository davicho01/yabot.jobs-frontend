// Step titles and small helpers for the apply page (/jobs/:id/apply,
// ApplyPage2), kept out of the page file so it exports only components.
import type { AutoScoreRun } from "../api/types";

// Applied_at is a real timestamp (unlike the follow-up date, which is a
// day with no time-of-day), so it's worth telling apart from "Sep 23,
// 2026" — the candidate clicked Mark as applied at some specific moment,
// and step 4 says so.
export function formatAppliedAt(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    // Only spell out the year when it isn't this one.
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export type StepProgressPart = {
  label: string;
  state: "done" | "current" | "todo";
  /** How long the stage may take (the backend's deadline for it), so a
   *  running bar fills over that time; and how far into it the stage
   *  already is, so a reload mid-stage picks the bar up where it was. */
  seconds?: number;
  elapsed?: number;
};

// The real-world order a candidate works through a posting in — replaces
// the old Fit/Update Resume/Application plan/Documents/Notes tabs (which
// scattered the same handful of actions across unrelated groupings) with
// one linear process. Notes/status live in their own card above
// this instead of being a "step" — they're ongoing, not a one-time task.
export const STEP_TITLES: Record<number, string> = {
  1: "Evaluate your resume",
  2: "Address gaps & tailor your resume",
  3: "Write a cover letter",
  4: "Apply for the job",
  5: "Prep for the interview",
};

// Short names for the Next/Skip buttons — the full titles above made
// "Next: Address gaps & tailor your resume →" too long for one button.
export const STEP_SHORT_TITLES: Record<number, string> = {
  2: "Tailor resume",
  3: "Cover letter",
  4: "Apply",
  5: "Interview prep",
};

// One line under the toolbar once a run has finished — why it stopped where
// it did, or that the job is ready to apply.
export function autoScoreOutcome(run: AutoScoreRun): { text: string; ready: boolean } | null {
  switch (run.status) {
    case "ready":
      return { text: `Ready to apply · best score ${run.best_score}`, ready: true };
    case "not_ready":
      return { text: `Score: best ${run.best_score} — below 85, not marked ready`, ready: false };
    case "below_threshold":
      return { text: `Score: ${run.resume_score} — below 75, so it wasn't tailored`, ready: false };
    case "failed":
      return { text: `Score failed: ${run.error ?? "unknown error"}`, ready: false };
    default:
      return null;
  }
}

export function processStepHeaderId(index: number): string {
  return `process-step-header-${index}`;
}
