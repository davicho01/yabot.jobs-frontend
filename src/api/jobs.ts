import { api } from "./client";
import type { JobDetail, JobList, Metro } from "./types";

export const PAGE_SIZE = 20;

export type WorkplaceTypeFilter = "remote" | "hybrid" | "onsite";

export interface JobFilters {
  q?: string;
  location?: string;
  metro?: string;
  company?: string;
  postedWithinDays?: number;
  workplaceType?: WorkplaceTypeFilter;
  page?: number;
}

export const jobsApi = {
  list: ({ q, location, metro, company, postedWithinDays, workplaceType, page = 1 }: JobFilters) =>
    api.get<JobList>("/jobs", {
      q,
      location,
      metro,
      company,
      posted_within_days: postedWithinDays,
      workplace_type: workplaceType,
      page,
      page_size: PAGE_SIZE,
    }),
  // Places to suggest as the location box is typed: "City, State, United States",
  // "State, United States" or "United States". Searching one covers the city and
  // 25 miles around it (or the whole state).
  places: (q?: string, limit?: number) => api.get<string[]>("/jobs/places", { q: q || undefined, limit }),
  // One area by its URL slug (null if unknown) — labels a shared ?metro= link.
  metro: (slug: string) => api.get<Metro[]>("/jobs/metros", { slug }).then((found) => found[0] ?? null),
  get: (urlId: string) => api.get<JobDetail>(`/jobs/${urlId}`),
  rescan: (urlId: string) => api.post<JobDetail>(`/jobs/${urlId}/rescan`),
  submit: (url: string) => api.post<JobDetail>("/jobs", { url }),
};
