import { api } from "./client";
import type { SavedSearch } from "./types";

// Every field always explicitly provided (never omitted) by the only
// builder below, paramsToSavedSearchPayload — plain `| null`, not optional,
// so this also satisfies SavedSearchFilters further down for free.
export interface SavedSearchCreatePayload {
  name: string | null;
  q: string | null;
  location: string | null;
  metro: string | null;
  radius: number | null;
  company: string | null;
  posted_within_days: number | null;
  workplace_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

export const savedSearchesApi = {
  list: () => api.get<SavedSearch[]>("/saved-searches"),
  create: (payload: SavedSearchCreatePayload) => api.post<SavedSearch>("/saved-searches", payload),
  remove: (id: string) => api.delete<void>(`/saved-searches/${id}`),
};

// The board's current filters (its own URLSearchParams) as a create payload
// — same param names JobBoardPage/Header already read, so this and
// savedSearchToParams below stay each other's exact inverse.
export function paramsToSavedSearchPayload(params: URLSearchParams, name: string): SavedSearchCreatePayload {
  return {
    name: name.trim() || null,
    q: params.get("q") || null,
    location: params.get("location") || null,
    metro: params.get("metro") || null,
    radius: Number(params.get("radius")) || null,
    company: params.get("company") || null,
    posted_within_days: Number(params.get("posted")) || null,
    workplace_type: params.get("workplace") || null,
    salary_min: params.has("salaryMin") ? Number(params.get("salaryMin")) : null,
    salary_max: params.has("salaryMax") ? Number(params.get("salaryMax")) : null,
  };
}

// The inverse — a saved search's stored filters as board URL params, for
// "Open" on the saved-searches list.
export function savedSearchToParams(search: SavedSearch): URLSearchParams {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.location) params.set("location", search.location);
  if (search.metro) params.set("metro", search.metro);
  if (search.radius) params.set("radius", String(search.radius));
  if (search.company) params.set("company", search.company);
  if (search.posted_within_days) params.set("posted", String(search.posted_within_days));
  if (search.workplace_type) params.set("workplace", search.workplace_type);
  if (search.salary_min !== null) params.set("salaryMin", String(search.salary_min));
  if (search.salary_max !== null) params.set("salaryMax", String(search.salary_max));
  return params;
}

const WORKPLACE_LABELS: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

// Just the filter fields — a SavedSearch satisfies this structurally, and so
// does a plain create payload, so describeSavedSearch below works both for
// an already-saved search and for a suggested name while saving one.
type SavedSearchFilters = Pick<
  SavedSearch,
  "q" | "location" | "metro" | "workplace_type" | "company" | "salary_min" | "salary_max" | "posted_within_days"
>;

// A human-readable summary of what a saved search covers — used as the
// suggested name when saving one, and as the fallback list label for a
// search nobody named.
export function describeSavedSearch(search: SavedSearchFilters): string {
  const parts: string[] = [];
  if (search.q) parts.push(`"${search.q}"`);
  // In practice `location` always carries the display text (picking a metro
  // area from the location box sets it as text too, "…(metro area)" and
  // all) — `metro` alone only happens from an old shared ?metro= link saved
  // as-is, without ever touching the location box.
  if (search.location) parts.push(search.location);
  else if (search.metro) parts.push(search.metro);
  if (search.workplace_type) parts.push(WORKPLACE_LABELS[search.workplace_type] ?? search.workplace_type);
  if (search.company) parts.push(search.company);
  if (search.salary_min && search.salary_max) {
    parts.push(`$${search.salary_min.toLocaleString()}–$${search.salary_max.toLocaleString()}`);
  } else if (search.salary_min) {
    parts.push(`$${search.salary_min.toLocaleString()}+`);
  } else if (search.salary_max) {
    parts.push(`Up to $${search.salary_max.toLocaleString()}`);
  }
  if (search.posted_within_days) parts.push(`Posted within ${search.posted_within_days}d`);
  return parts.length > 0 ? parts.join(" · ") : "All postings";
}
