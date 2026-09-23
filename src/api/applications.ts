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
    payload: {
      status?: ApplicationStatus;
      notes?: string;
      is_archived?: boolean;
      follow_up_at?: string | null;
      // Same omitted-vs-null distinction as follow_up_at: omitted leaves
      // the stored pick alone, explicit null clears it back to is_main.
      selected_resume_id?: string | null;
    },
  ) => api.patch<Application>(`/applications/${id}`, payload),
  // Backend counterpart to the apply-page's bulk-actions bar — applies
  // status and/or is_archived to several applications in one call instead
  // of fanning individual `update` calls out client-side (one request per
  // selected row) the way every bulk action here used to.
  bulkUpdate: (ids: string[], payload: { status?: ApplicationStatus; is_archived?: boolean }) =>
    api.patch<Application[]>("/applications/bulk-update", { ids, ...payload }),
  remove: (id: string) => api.delete<void>(`/applications/${id}`),
};
