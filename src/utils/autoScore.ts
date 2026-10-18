import { useEffect, useRef, useState } from "react";
import type { AutoScoreStatus } from "../api/types";

// A run in one of these is still working on the backend (see
// app.services.auto_score) — poll it until it leaves them.
const AUTO_SCORE_ACTIVE: AutoScoreStatus[] = ["queued", "scoring", "tailoring", "scoring_tailored"];

// How often a page re-reads a running run.
export const AUTO_SCORE_POLL_MS = 3000;

// The least time each step of a run stays on screen (progress bars, step
// markers), so a fast step is still seen rather than skipped.
const MIN_STEP_MS = 1000;

export function isAutoScoreActive(status: AutoScoreStatus | undefined): boolean {
  return status !== undefined && AUTO_SCORE_ACTIVE.includes(status);
}

// The status to show next on the way from `shown` to `actual`, one step at
// a time. A run that ended ready/not_ready went through tailoring and
// scoring the tailored resume, so those are shown even if the poll never
// caught them; one that stopped early (below 75, failed) goes straight to
// its end.
function nextShownStatus(shown: AutoScoreStatus, actual: AutoScoreStatus): AutoScoreStatus {
  const shownIndex = AUTO_SCORE_ACTIVE.indexOf(shown);
  const actualIndex = AUTO_SCORE_ACTIVE.indexOf(actual);
  const passesThroughAll = actual === "ready" || actual === "not_ready";
  if (actualIndex > shownIndex || (passesThroughAll && shownIndex < AUTO_SCORE_ACTIVE.length - 1)) {
    return AUTO_SCORE_ACTIVE[shownIndex + 1];
  }
  return actual;
}

// `actual`, but stepped through so each in-progress step stays on screen
// for at least MIN_STEP_MS — including the steps a 3s poll can jump right
// past. A new run, or the first status read, shows at once.
export function useShownAutoScoreStatus(actual: AutoScoreStatus | undefined): AutoScoreStatus | undefined {
  const [shown, setShown] = useState(actual);
  const shownAt = useRef(0); // set by the effect below on mount

  useEffect(() => {
    shownAt.current = Date.now();
  }, [shown]);

  useEffect(() => {
    if (shown === actual) return;
    const immediate = actual === undefined || shown === undefined || !isAutoScoreActive(shown);
    const next = immediate ? actual : nextShownStatus(shown!, actual);
    const wait = immediate ? 0 : Math.max(0, MIN_STEP_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setShown(next), wait);
    return () => clearTimeout(timer);
  }, [shown, actual]);

  return shown;
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

// Dev-only, same switch: ?previewScore=cover_letter|interview_prep on the
// apply page shows that step's writing progress bar without generating
// anything. Ignored in production builds.
export type PreviewWriting = "cover_letter" | "interview_prep";

export function previewWriting(): PreviewWriting | undefined {
  if (!import.meta.env.DEV) return undefined;
  const value = new URLSearchParams(window.location.search).get("previewScore");
  return value === "cover_letter" || value === "interview_prep" ? value : undefined;
}
