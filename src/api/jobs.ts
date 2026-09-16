import { api } from "./client";
import type { JobDetail, JobList } from "./types";

export const PAGE_SIZE = 20;

export type WorkplaceTypeFilter = "remote" | "hybrid" | "onsite";

export interface JobFilters {
  q?: string;
  location?: string;
  company?: string;
  postedWithinDays?: number;
  workplaceType?: WorkplaceTypeFilter;
  page?: number;
}

export const jobsApi = {
  list: ({ q, location, company, postedWithinDays, workplaceType, page = 1 }: JobFilters) =>
    api.get<JobList>("/jobs", {
      q,
      location,
      company,
      posted_within_days: postedWithinDays,
      workplace_type: workplaceType,
      page,
      page_size: PAGE_SIZE,
    }),
  locations: () => api.get<string[]>("/jobs/locations"),
  get: (urlId: string) => api.get<JobDetail>(`/jobs/${urlId}`),
  rescan: (urlId: string) => api.post<JobDetail>(`/jobs/${urlId}/rescan`),
  submit: (url: string) => api.post<JobDetail>("/jobs", { url }),
};
