import type { AutoScoreStatus } from "../api/types";

// A run in one of these is still working on the backend (see
// app.services.auto_score) — poll it until it leaves them.
const AUTO_SCORE_ACTIVE: AutoScoreStatus[] = ["queued", "scoring", "tailoring", "scoring_tailored"];

// How often a page re-reads a running run.
export const AUTO_SCORE_POLL_MS = 3000;

export function isAutoScoreActive(status: AutoScoreStatus | undefined): boolean {
  return status !== undefined && AUTO_SCORE_ACTIVE.includes(status);
}

// Dev-only: ?previewScore=scoring|tailoring|scoring_tailored (or queued) on
// the apply page or /applications shows that in-progress state — spinners,
// progress bars — without starting a run, so styling them costs no LLM
// calls. Ignored in production builds.
export function previewAutoScoreStatus(): AutoScoreStatus | undefined {
  if (!import.meta.env.DEV) return undefined;
  const value = new URLSearchParams(window.location.search).get("previewScore") as AutoScoreStatus | null;
  return value !== null && AUTO_SCORE_ACTIVE.includes(value) ? value : undefined;
}
