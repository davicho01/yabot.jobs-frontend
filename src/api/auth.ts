import { api } from "./client";
import type { User } from "./types";

// A true partial update — a field left out here is left out of the request
// body entirely (JSON.stringify drops an `undefined` value), which is what
// tells the backend not to touch it (UserUpdate's exclude_unset). Passing
// display_name: null, by contrast, is a deliberate "clear the name".
export interface UserUpdatePayload {
  display_name?: string | null;
  email_alerts_enabled?: boolean;
}

export const authApi = {
  me: () => api.get<User>("/auth/me"),
  // A six-digit code by email, typed in where it was asked for, so signing
  // in doesn't leave the page (unlike the old emailed links, which /verify
  // still redeems for any left in inboxes).
  requestCode: (email: string) => api.post<{ detail: string }>("/auth/request-code", { email }),
  verifyCode: (email: string, code: string) => api.post<{ user: User }>("/auth/verify-code", { email, code }),
  verify: (token: string) => api.post<{ user: User }>("/auth/verify", { token }),
  google: (credential: string) => api.post<{ user: User }>("/auth/google", { credential }),
  logout: () => api.post<void>("/auth/logout"),
  updateMe: (payload: UserUpdatePayload) => api.patch<User>("/auth/me", payload),
};
