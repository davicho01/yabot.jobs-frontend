import { api } from "./client";
import type { Feedback, FeedbackKind } from "./types";

export interface FeedbackCreatePayload {
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  page_url: string | null;
}

export const feedbackApi = {
  submit: (payload: FeedbackCreatePayload) => api.post<Feedback>("/feedback", payload),
};
