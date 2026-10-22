import { onboardingApi } from "../api/onboarding";
import { BOARD_PATH } from "../routes";
import { GETTING_STARTED_PATH } from "../utils/onboarding";

// Where LoginPage stashes ?next= for the emailed-link path: the magic-link
// email always points at /auth/callback with no `next` (see backend's POST
// /auth/request-link), so AuthCallbackPage reads it back from here.
export const POST_LOGIN_NEXT_KEY = "post_login_next";

// Someone who hasn't done a single getting-started step yet lands on the
// walkthrough instead of the board. Best-effort: any failure just means the
// board, same as before the walkthrough existed.
async function isBrandNewUser(): Promise<boolean> {
  try {
    const onboarding = await onboardingApi.get();
    // AI access doesn't count: with the free trial on, that step starts out done.
    return (
      !onboarding.completed_at &&
      !onboarding.dismissed_at &&
      onboarding.steps.every((step) => step.key === "ai_access" || !step.done)
    );
  } catch {
    return false;
  }
}

// Where to send someone right after they sign in, by email link or Google:
// back where they started if the page asked for it, else the walkthrough
// for a brand-new user, else the board.
export async function postLoginDestination(requestedNext: string | null): Promise<string> {
  sessionStorage.removeItem(POST_LOGIN_NEXT_KEY);
  if (requestedNext) return requestedNext;
  return (await isBrandNewUser()) ? GETTING_STARTED_PATH : BOARD_PATH;
}
