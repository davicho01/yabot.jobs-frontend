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
  // Individual locations (one per place, even for multi-location postings),
  // most-used first; `q` narrows to ones containing it, for a typeahead.
  // `unresolvedOnly` leaves out places that belong to a metro area — those are
  // suggested by `metros` instead, not as a dozen spellings of the same city.
  locations: (q?: string, limit?: number, unresolvedOnly?: boolean) =>
    api.get<string[]>("/jobs/locations", { q: q || undefined, limit, unresolved_only: unresolvedOnly || undefined }),
  // Metro/micro areas that have postings, most postings first, for a typeahead.
  metros: (q?: string, limit?: number) => api.get<Metro[]>("/jobs/metros", { q: q || undefined, limit }),
  // One area by its URL slug (null if unknown) — labels a shared ?metro= link.
  metro: (slug: string) => api.get<Metro[]>("/jobs/metros", { slug }).then((found) => found[0] ?? null),
  get: (urlId: string) => api.get<JobDetail>(`/jobs/${urlId}`),
  rescan: (urlId: string) => api.post<JobDetail>(`/jobs/${urlId}/rescan`),
  submit: (url: string) => api.post<JobDetail>("/jobs", { url }),
};
