import { api } from "./client";
import type { Application, ApplicationStatus } from "./types";

export const applicationsApi = {
  list: () => api.get<Application[]>("/applications"),
  create: (url: string) => api.post<Application>("/applications", { url }),
  update: (id: string, payload: { status?: ApplicationStatus; notes?: string; is_archived?: boolean }) =>
    api.patch<Application>(`/applications/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/applications/${id}`),
};
