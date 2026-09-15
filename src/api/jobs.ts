import { api } from "./client";
import type { JobDetail, JobList } from "./types";

export const PAGE_SIZE = 20;

export interface JobFilters {
  q?: string;
  location?: string;
  remoteOnly?: boolean;
  page?: number;
}

export const jobsApi = {
  list: ({ q, location, remoteOnly, page = 1 }: JobFilters) =>
    api.get<JobList>("/jobs", { q, location, remote_only: remoteOnly || undefined, page, page_size: PAGE_SIZE }),
  locations: () => api.get<string[]>("/jobs/locations"),
  get: (urlId: string) => api.get<JobDetail>(`/jobs/${urlId}`),
  rescan: (urlId: string) => api.post<JobDetail>(`/jobs/${urlId}/rescan`),
  submit: (url: string) => api.post<JobDetail>("/jobs", { url }),
};
