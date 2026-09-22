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
  requestLink: (email: string) => api.post<{ detail: string }>("/auth/request-link", { email }),
  verify: (token: string) => api.post<{ user: User }>("/auth/verify", { token }),
  logout: () => api.post<void>("/auth/logout"),
  updateMe: (payload: UserUpdatePayload) => api.patch<User>("/auth/me", payload),
};
