import { useCallback, useLayoutEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi, type WorkplaceTypeFilter } from "../api/jobs";
import { adminApi } from "../api/admin";
import type { JobDetail, JobPosting } from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import { JobCaseFile } from "../components/JobCaseFile";
import "./JobBoardPage.css";

// Must match the max-width of the phone breakpoint in JobBoardPage.css, where
// the list and detail panes stop sitting side by side and take turns instead.
const SPLIT_COLLAPSED_QUERY = "(max-width: 760px)";

// A JobPosting row exists from the moment its URL is submitted (see
// get_or_create_job_posting) so job_posting_id is available right away —
// scanned/not-scanned is tracked by extraction_status, not by the posting
// being present at all.
function scannedPosting(job: JobDetail): JobPosting | null {
  return job.posting && job.posting.extraction_status !== "pending" ? job.posting : null;
}

function formatSalary(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p || (!p.salary_min && !p.salary_max)) return null;
  const currency = p.salary_currency ?? "";
  if (p.salary_min && p.salary_max) return `${currency} ${p.salary_min.toLocaleString()}–${p.salary_max.toLocaleString()}`;
  return `${currency} ${(p.salary_min ?? p.salary_max)?.toLocaleString()}`;
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

function JobCard({ job, active, onSelect }: { job: JobDetail; active: boolean; onSelect: () => void }) {
  const posting = scannedPosting(job);
  return (
    <button type="button" className={`job-card${active ? " job-card--active" : ""}`} onClick={onSelect}>
      <span className="job-card__edge" data-type={posting?.workplace_type ?? "unknown"} />
      <div className="job-card__body">
        <div className="job-card__title">{posting?.title ?? "Scanning posting…"}</div>
        <div className="job-card__meta">
          {posting?.company_name ?? job.url.domain}
          {posting?.location ? ` · ${posting.location}` : ""}
        </div>
        {formatSalary(job) && <div className="job-card__salary">{formatSalary(job)}</div>}
        {posting && (
          <div className="job-card__tags">
            <span className="tag">{posting.workplace_type}</span>
            <span className="tag">{posting.employment_type.replace("_", " ")}</span>
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
  const company = searchParams.get("company") ?? "";
  const postedWithinDays = Number(searchParams.get("posted")) || undefined;
  const workplaceType = (searchParams.get("workplace") as WorkplaceTypeFilter | null) ?? undefined;
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

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", query, location, metro, company, postedWithinDays, workplaceType, page],
    queryFn: () =>
      jobsApi.list({
        q: query || undefined,
        location: location || undefined,
        metro: metro || undefined,
        company: company || undefined,
        postedWithinDays,
        workplaceType,
        page,
      }),
  });

  const jobs = data?.items;
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
          <div className="board__list-scroll">
              {isLoading && <p className="board__empty">Loading postings…</p>}
              {!isLoading && jobs?.length === 0 && <p className="board__empty">No postings match your filters.</p>}
              {jobs?.map((job) => (
                <JobCard
                  key={job.url.id}
                  job={job}
                  active={job.url.id === (selected?.url.id ?? "")}
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
              />
            )}
        </div>
      </div>
    </div>
  );
}
