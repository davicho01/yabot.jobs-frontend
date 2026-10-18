import type { JobDetail, JobPosting } from "../api/types";

// A JobPosting row exists from the moment its URL is submitted (see
// get_or_create_job_posting) so job_posting_id is available right away —
// scanned/not-scanned is tracked by extraction_status, not by the posting
// being present at all. Used by ApplyPage for its "has this actually
// finished scanning" check.
export function scannedPosting(job: JobDetail): JobPosting | null {
  return job.posting && job.posting.extraction_status !== "pending" ? job.posting : null;
}

export function formatSalary(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p || (!p.salary_min && !p.salary_max)) return null;
  const currency = p.salary_currency ?? "";
  if (p.salary_min && p.salary_max) return `${currency} ${p.salary_min.toLocaleString()}–${p.salary_max.toLocaleString()}`;
  return `${currency} ${(p.salary_min ?? p.salary_max)?.toLocaleString()}`;
}

export type JobAgeTone = "fresh" | "recent" | "older";

// How old a job is, for the job page's "Found 20m ago!" badge and the search
// cards' "Posted 1d ago": "just now", "20m ago", "2h ago" under 24h (fresh,
// green), "1d ago" from 24h to 48h (recent, amber), "3d ago" from 48h to 7
// days (older, gray), and null after that or once the job is closed.
// Worked out when the page renders — it doesn't tick live.
//
// The age runs from whichever is older, the posted date or our first scan:
// a job posted Jul 31 that we only found Oct 12 (a board we only just
// started crawling) is old, however recently we found it. posted_at is a
// date-only string (midnight UTC), so it only counts when it's an earlier
// day than the first scan — on the same day the scan's own time is the more
// precise one ("1h ago", not "19h ago" from midnight).
export function jobAge(job: JobDetail): { ago: string; tone: JobAgeTone } | null {
  const p = scannedPosting(job);
  if (!p?.first_scanned_at || job.url.closed_at) return null;
  const firstScanned = new Date(p.first_scanned_at).getTime();
  const firstScannedDay = Date.parse(new Date(firstScanned).toISOString().slice(0, 10));
  const posted = p.posted_at ? Date.parse(p.posted_at) : Number.NaN;
  const since = !Number.isNaN(posted) && posted < firstScannedDay ? posted : firstScanned;
  const minutes = Math.max(0, Math.floor((Date.now() - since) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 7 * 24) return null;
  if (hours >= 24) return { ago: `${Math.floor(hours / 24)}d ago`, tone: hours >= 48 ? "older" : "recent" };
  if (minutes < 1) return { ago: "just now", tone: "fresh" };
  if (minutes < 60) return { ago: `${minutes}m ago`, tone: "fresh" };
  return { ago: `${hours}h ago`, tone: "fresh" };
}

export function formatPostedAt(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p?.posted_at) return null;
  // posted_at is a date-only string (YYYY-MM-DD) — parsing it as UTC and
  // formatting with the same zone keeps the displayed day from shifting
  // backward for anyone west of UTC.
  const date = new Date(`${p.posted_at}T00:00:00Z`);
  return `Posted ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

// A location, short: the first of several places, without the
// country on the end ("Work At Home-Virginia, United States of America" →
// "Work At Home-Virginia"). On the job board's cards and open posting.
export function shortLocation(location: string): string {
  const first = location.split(/;|\|/)[0].trim();
  return first.replace(/,?\s*(United States( of America)?|USA|U\.S\.A?\.?)$/i, "").trim() || first;
}
