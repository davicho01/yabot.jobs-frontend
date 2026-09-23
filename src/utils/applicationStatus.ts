import type { ApplicationStatus } from "../api/types";

// Used by StatusSelect (ApplyPage's own status pill/menu) so its
// option list stays in sync with the backend's ApplicationStatus union.
export const STATUSES: ApplicationStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"];

// Same tinted-capsule tones as the .stamp family (index.css) and the
// marketing site's mock status pills (index.html's "Applied"/"Interviewing"/
// "Offer" stamps) — StatusSelect uses this so the field reads the same way
// wherever it appears instead of a single flat color for every status.
export function statusTone(status: ApplicationStatus): "default" | "positive" | "warning" | "negative" | "neutral" {
  switch (status) {
    case "applied":
      return "default";
    case "interviewing":
      return "warning";
    case "offer":
      return "positive";
    case "rejected":
      return "negative";
    case "saved":
    case "withdrawn":
      return "neutral";
  }
}
