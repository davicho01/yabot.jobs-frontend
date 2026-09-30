import { api } from "./client";
import type { AiAccess, Onboarding } from "./types";

export const onboardingApi = {
  get: () => api.get<Onboarding>("/onboarding"),
  dismiss: () => api.post<Onboarding>("/onboarding/dismiss"),
  // Opening AI access is what completes getting started's "Set up AI access"
  // step for someone on the free trial.
  aiAccessSeen: () => api.post<Onboarding>("/onboarding/ai-access-seen"),
  aiAccess: () => api.get<AiAccess>("/ai-access"),
};

// Everything that can change a getting-started step or the free-evaluation
// count lives under these keys — invalidate them after any of those actions.
export const ONBOARDING_QUERY_KEY = ["onboarding"] as const;
export const AI_ACCESS_QUERY_KEY = ["ai-access"] as const;
