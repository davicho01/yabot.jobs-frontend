import { api } from "./client";
import type { Application, ApplicationStatus } from "./types";

export const applicationsApi = {
  list: () => api.get<Application[]>("/applications"),
  create: (url: string) => api.post<Application>("/applications", { url }),
  // follow_up_at: string | null, not just string — omitted means "don't
  // touch it", explicitly null means "clear the reminder" (the backend's
  // partial update tells those apart; JSON.stringify drops an omitted/
  // undefined key but keeps an explicit null).
  update: (
    id: string,
    payload: { status?: ApplicationStatus; notes?: string; is_archived?: boolean; follow_up_at?: string | null },
  ) => api.patch<Application>(`/applications/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/applications/${id}`),
};
