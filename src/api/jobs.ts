import { api } from "./client";
import type { FlagReason, JobDetail, JobList, Metro, SimilarJobs } from "./types";

export const PAGE_SIZE = 20;

export type WorkplaceTypeFilter = "remote" | "hybrid" | "onsite";

export interface JobFilters {
  q?: string;
  location?: string;
  metro?: string;
  radius?: number;
  company?: string;
  postedWithinDays?: number;
  workplaceType?: WorkplaceTypeFilter;
  salaryMin?: number;
  salaryMax?: number;
  page?: number;
}

export const jobsApi = {
  list: ({
    q,
    location,
    metro,
    radius,
    company,
    postedWithinDays,
    workplaceType,
    salaryMin,
    salaryMax,
    page = 1,
  }: JobFilters) =>
    api.get<JobList>("/jobs", {
      q,
      location,
      metro,
      radius,
      company,
      posted_within_days: postedWithinDays,
      workplace_type: workplaceType,
      salary_min: salaryMin,
      salary_max: salaryMax,
      page,
      page_size: PAGE_SIZE,
    }),
  // Places to suggest as the location box is typed: "City, State, United States",
  // "State, United States" or "United States". Searching a city lists it first,
  // then nearby places out to `radius` miles (25 by default); a state, the whole state.
  places: (q?: string, limit?: number) => api.get<string[]>("/jobs/places", { q: q || undefined, limit }),
  // The closest known city to a browser geolocation fix, in the same format
  // `places` suggestions come in — null if nothing's close enough to guess.
  nearestPlace: (lat: number, lon: number) => api.get<string | null>("/jobs/places/nearest", { lat, lon }),
  // One area by its URL slug (null if unknown) — labels a shared ?metro= link.
  metro: (slug: string) => api.get<Metro[]>("/jobs/metros", { slug }).then((found) => found[0] ?? null),
  get: (urlId: string) => api.get<JobDetail>(`/jobs/${urlId}`),
  similar: (urlId: string) => api.get<SimilarJobs>(`/jobs/${urlId}/similar`),
  rescan: (urlId: string) => api.post<JobDetail>(`/jobs/${urlId}/rescan`),
  submit: (url: string) => api.post<JobDetail>("/jobs", { url }),
  // Reports that this listing's scanned data looks wrong — queued for admin
  // triage (GET /admin/jobs?flagged=true), not acted on immediately. The
  // response never echoes the report back (see JobPostingUrl.flag_reason's
  // comment in ./types) — it's the same shape as every other job detail.
  flag: (urlId: string, reason: FlagReason, note: string | undefined) =>
    api.post<JobDetail>(`/jobs/${urlId}/flag`, { reason, note: note || undefined }),
};
