import { useCallback, useLayoutEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi, type WorkplaceTypeFilter } from "../api/jobs";
import { adminApi } from "../api/admin";
import type { JobDetail, JobPosting } from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import { JobCaseFile } from "../components/JobCaseFile";
import { highlightQuery } from "../utils/searchHighlight";
import { employmentLabel, workplaceLabel } from "../utils/jobTags";
import "./JobBoardPage.css";
import CompanyLogo from "../components/CompanyLogo";

// Must match the max-width of the phone breakpoint in JobBoardPage.css, where
// the list and detail panes stop sitting side by side and take turns instead.
const SPLIT_COLLAPSED_QUERY = "(max-width: 760px)";
// A city search can be widened in steps up to the server's limit.
const RADIUS_STEP = 25;
const MAX_RADIUS = 100;

// A JobPosting row exists from the moment its URL is submitted (see
// get_or_create_job_posting) so job_posting_id is available right away —
// scanned/not-scanned is tracked by extraction_status, not by the posting
// being present at all.
function scannedPosting(job: JobDetail): JobPosting | null {
  return job.posting && job.posting.extraction_status !== "pending" ? job.posting : null;
}

// A card's pay label: "$184K–$288K" instead of the job page's "USD 184,000–287,500",
// so it fits beside the other labels. Hourly amounts stay exact ("$20–$26").
function formatSalaryShort(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p || (!p.salary_min && !p.salary_max)) return null;
  let format: (n: number) => string;
  try {
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.salary_currency || "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    });
    format = (n) => compact.format(n);
  } catch {
    // Not a currency code Intl knows: plain numbers after the code, as before.
    format = (n) => `${p.salary_currency ?? ""} ${n.toLocaleString()}`.trim();
  }
  if (p.salary_min && p.salary_max && p.salary_min !== p.salary_max) {
    return `${format(p.salary_min)}–${format(p.salary_max)}`;
  }
  return format((p.salary_min || p.salary_max)!);
}

function formatPostedAt(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p?.posted_at) return null;
  // posted_at is a date-only string (YYYY-MM-DD) — parsing it as UTC and
  // formatting with the same zone keeps the displayed day from shifting
  // backward for anyone west of UTC.
  const date = new Date(`${p.posted_at}T00:00:00Z`);
  return `Posted ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

function JobCard({
  job,
  active,
  query,
  onSelect,
}: {
  job: JobDetail;
  active: boolean;
  query: string;
  onSelect: () => void;
}) {
  const posting = scannedPosting(job);
  return (
    <button type="button" className={`job-card${active ? " job-card--active" : ""}`} onClick={onSelect}>
      <span className="job-card__edge" data-type={posting?.workplace_type ?? "unknown"} />
      <div className="job-card__body">
        {/* Company first, logo beside its name, then the title — same order as the job page it opens. */}
        <div className="job-card__employer">
          <CompanyLogo name={posting?.company_name ?? job.url.domain} logoUrl={posting?.company_logo_url} size={32} />
          <span>{posting?.company_name ?? job.url.domain}</span>
        </div>
        <div className="job-card__title">
          {posting?.title ? highlightQuery(posting.title, query) : "Scanning posting…"}
        </div>
        {posting?.location && <div className="job-card__meta">{posting.location}</div>}
        {posting && (
          <div className="job-card__tags">
            {workplaceLabel(posting.workplace_type) && (
              <span className={`tag tag--workplace-${posting.workplace_type}`}>{workplaceLabel(posting.workplace_type)}</span>
            )}
            {/* Full-time is most jobs, so a card only calls out the exceptions; the job page shows it. */}
            {posting.employment_type !== "full_time" && employmentLabel(posting.employment_type) && (
              <span className="tag">{employmentLabel(posting.employment_type)}</span>
            )}
            {/* Same blue label as the job page's pay tag, shortened to fit a card. */}
            {formatSalaryShort(job) && <span className="tag tag--accent">{formatSalaryShort(job)}</span>}
            {formatPostedAt(job) && <span className="job-card__posted">{formatPostedAt(job)}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

export function JobBoardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth for all board state (search, location,
  // remote toggle, page, selection) so refreshing the page or sharing the
  // link reproduces exactly what's on screen. The search/location/remote
  // input controls themselves live in <Header> (always visible there,
  // even off this page) — this just reads whatever they've put in the URL.
  const selectedId = searchParams.get("jobId");
  const query = searchParams.get("q") ?? "";
  const location = searchParams.get("location") ?? "";
  const metro = searchParams.get("metro") ?? "";
  // How far around a searched city to look, once someone has widened it; unset means the server's default.
  const radius = Number(searchParams.get("radius")) || undefined;
  const company = searchParams.get("company") ?? "";
  const postedWithinDays = Number(searchParams.get("posted")) || undefined;
  const workplaceType = (searchParams.get("workplace") as WorkplaceTypeFilter | null) ?? undefined;
  const salaryMin = Number(searchParams.get("salaryMin")) || undefined;
  const salaryMax = Number(searchParams.get("salaryMax")) || undefined;
  const page = Number(searchParams.get("page")) || 1;

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          update(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  function setPage(updater: (current: number) => number) {
    updateParams((next) => {
      const newPage = updater(page);
      if (newPage <= 1) next.delete("page");
      else next.set("page", String(newPage));
    });
  }

  // The "near you" default (geolocation -> GET /jobs/places/nearest) is set in
  // <Header>, not here — it also has to land in the location box's own visible
  // text, which is Header's local state, not just this page's URL params.

  const { data, isLoading } = useQuery({
    queryKey: [
      "jobs",
      query,
      location,
      metro,
      radius,
      company,
      postedWithinDays,
      workplaceType,
      salaryMin,
      salaryMax,
      page,
    ],
    queryFn: () =>
      jobsApi.list({
        q: query || undefined,
        location: location || undefined,
        metro: metro || undefined,
        radius,
        company: company || undefined,
        postedWithinDays,
        workplaceType,
        salaryMin,
        salaryMax,
        page,
      }),
  });

  const jobs = data?.items;
  const searchArea = data?.search_area;
  const widerRadius = searchArea ? searchArea.radius_miles + RADIUS_STEP : 0;

  function widenSearch() {
    updateParams((next) => {
      next.set("radius", String(widerRadius));
      next.delete("page");
    });
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  // Fetched directly by id (not just looked up in the current page's
  // results) so a selected job stays visible on refresh or when the URL is
  // shared — the target job may live on a different page/filter than
  // whatever this session's board happens to be showing.
  const { data: selectedJob, isLoading: selectedJobLoading } = useQuery({
    queryKey: ["job", selectedId],
    queryFn: () => jobsApi.get(selectedId!),
    enabled: !!selectedId,
  });
  const selected = selectedId ? selectedJob : jobs?.[0];

  const queryClient = useQueryClient();
  const rescanMutation = useMutation({
    mutationFn: (urlId: string) => jobsApi.rescan(urlId),
    onSuccess: (_data, urlId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
    },
  });
  const isRescanning = rescanMutation.isPending && rescanMutation.variables === selected?.url.id;
  const rescanFailed = rescanMutation.isError && rescanMutation.variables === selected?.url.id;

  const deleteListingMutation = useMutation({
    mutationFn: (urlId: string) => adminApi.deleteListing(urlId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      updateParams((next) => next.delete("jobId"));
    },
  });

  const { confirm, dialog } = useConfirm();

  // Where the list was scrolled to when a job was opened, so backing out of
  // the detail on a phone drops the user back on the card they tapped
  // instead of at the top of the list.
  const listScrollY = useRef(0);
  const hadSelection = useRef(!!selectedId);
  useLayoutEffect(() => {
    const hasSelection = !!selectedId;
    if (hasSelection === hadSelection.current) return;
    hadSelection.current = hasSelection;
    // On desktop both panes stay put and the page shouldn't jump.
    if (!window.matchMedia(SPLIT_COLLAPSED_QUERY).matches) return;
    window.scrollTo(0, hasSelection ? 0 : listScrollY.current);
  }, [selectedId]);

  function selectJob(id: string) {
    listScrollY.current = window.scrollY;
    updateParams((next) => next.set("jobId", id));
  }

  function closeDetail() {
    updateParams((next) => next.delete("jobId"));
  }

  async function deleteListing(urlId: string) {
    if (await confirm("Permanently delete this listing? This can't be undone.")) {
      deleteListingMutation.mutate(urlId);
    }
  }

  return (
    <div className={`board board--split${selectedId ? " board--detail-open" : ""}`}>
      {dialog}
      <div className="board__layout">
        <div className="board__list">
          <Link to="/applications" className="board__applications-link">
            My applications →
          </Link>
          <div className="board__list-scroll">
              {searchArea && (
                <p className="board__search-area">
                  Nearest first, within {searchArea.radius_miles} miles of {searchArea.label}
                  {widerRadius <= MAX_RADIUS && (
                    <>
                      {" · "}
                      <button type="button" className="board__widen" onClick={widenSearch}>
                        Search {widerRadius} miles
                      </button>
                    </>
                  )}
                </p>
              )}
              {isLoading && <p className="board__empty">Loading postings…</p>}
              {!isLoading && jobs?.length === 0 && <p className="board__empty">No postings match your filters.</p>}
              {jobs?.map((job) => (
                <JobCard
                  key={job.url.id}
                  job={job}
                  active={job.url.id === (selected?.url.id ?? "")}
                  query={query}
                  onSelect={() => selectJob(job.url.id)}
                />
              ))}
            </div>
            {data && data.total > 0 && (
              <div className="board__pagination">
                <button
                  type="button"
                  className="board__page-button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="board__page-status">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="board__page-button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next ›
                </button>
              </div>
            )}
          </div>

          <div className="board__detail">
            <button type="button" className="rescan-button board__back" onClick={closeDetail}>
              ‹ All postings
            </button>
            {!selected && selectedJobLoading && <p className="board__empty">Loading posting…</p>}
            {!selected && !selectedJobLoading && (
              <p className="board__empty">Select a posting to open its case file.</p>
            )}
            {selected && (
              <JobCaseFile
                job={selected}
                user={user}
                isRescanning={isRescanning}
                rescanFailed={rescanFailed}
                onRescan={() => rescanMutation.mutate(selected.url.id)}
                onDelete={() => deleteListing(selected.url.id)}
                isDeleting={deleteListingMutation.isPending}
                titleHighlightQuery={query}
                onSelectSimilar={selectJob}
              />
            )}
        </div>
      </div>
    </div>
  );
}
