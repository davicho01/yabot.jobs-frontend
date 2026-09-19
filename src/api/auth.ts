import { api } from "./client";
import type { User } from "./types";

export const authApi = {
  me: () => api.get<User>("/auth/me"),
  requestLink: (email: string) => api.post<{ detail: string }>("/auth/request-link", { email }),
  verify: (token: string) => api.post<{ user: User }>("/auth/verify", { token }),
  logout: () => api.post<void>("/auth/logout"),
  updateMe: (displayName: string | null) => api.patch<User>("/auth/me", { display_name: displayName }),
};
