import { ApiError } from "../api/client";

// Used by ApplyPage's own live fitness-check flows: a
// 422 names a missing prerequisite (no main resume, no LLM API key) in its
// own detail text, everything else is a generic failure.
export function prerequisiteMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status === 422) return err.message;
  return null;
}

export function genericErrorMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status !== 422) return err.message;
  if (err) return "Something went wrong. Try again.";
  return null;
}
