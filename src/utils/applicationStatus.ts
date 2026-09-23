import type { ApplicationStatus } from "../api/types";

// Used by StatusSelect (ApplyPage's own status pill/menu) so its
// option list stays in sync with the backend's ApplicationStatus union.
export const STATUSES: ApplicationStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"];
