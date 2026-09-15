import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import type { JobDetail, JobPosting } from "../api/types";
import "./JobBoardPage.css";

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
        {posting && (
          <div className="job-card__tags">
            <span className="tag">{posting.workplace_type}</span>
            <span className="tag">{posting.employment_type.replace("_", " ")}</span>
          </div>
        )}
      </div>
      {formatPostedAt(job) && <span className="job-card__posted">{formatPostedAt(job)}</span>}
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
  const remoteOnly = searchParams.get("remote") === "true";
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
    queryKey: ["jobs", query, location, remoteOnly, page],
    queryFn: () => jobsApi.list({ q: query || undefined, location: location || undefined, remoteOnly, page }),
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

  function selectJob(id: string) {
    updateParams((next) => next.set("jobId", id));
  }

  return (
    <div className="board">
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
            {!selected && selectedJobLoading && <p className="board__empty">Loading posting…</p>}
            {!selected && !selectedJobLoading && (
              <p className="board__empty">Select a posting to open its case file.</p>
            )}
            {selected && (
              <article className="case-file">
                {(() => {
                  const posting = scannedPosting(selected);
                  const scanFailed = selected.url.scan_status === "failed";
                  return (
                    <>
                      {(!posting || scanFailed) && (
                        <div className="case-file__header">
                          <span className="stamp stamp--neutral">{scanFailed ? "Scan failed" : "Scanning…"}</span>
                          {user && (
                            <button
                              type="button"
                              className="rescan-button"
                              disabled={isRescanning}
                              onClick={() => rescanMutation.mutate(selected.url.id)}
                            >
                              {isRescanning ? "Rescanning…" : "Rescan ↻"}
                            </button>
                          )}
                        </div>
                      )}
                      {scanFailed && selected.url.scan_error && (
                        <p className="rescan-error">{selected.url.scan_error}</p>
                      )}
                      {rescanFailed && <p className="rescan-error">Rescan failed — try again in a moment.</p>}
                      {posting && !scanFailed && (
                        <>
                          <div className="case-file__toolbar">
                            <div className="case-file__header-left">
                              {user && (
                                <button
                                  type="button"
                                  className="rescan-button"
                                  disabled={isRescanning}
                                  onClick={() => rescanMutation.mutate(selected.url.id)}
                                >
                                  {isRescanning ? "Rescanning…" : "Rescan ↻"}
                                </button>
                              )}
                            </div>
                            <div className="case-file__header-actions">
                              <a
                                href={selected.url.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rescan-button"
                              >
                                View Posting
                              </a>
                              <Link to={`/jobs/${selected.url.id}/apply`} className="apply-button">
                                Evaluate Job →
                              </Link>
                            </div>
                          </div>

                          <div className="case-file__header-title">
                            <h1>{posting.title ?? "Untitled role"}</h1>
                            <p className="case-file__company">
                              <span>
                                {posting.company_name ?? selected.url.domain}
                                {posting.location ? ` · ${posting.location}` : ""}
                              </span>
                              {formatPostedAt(selected) && (
                                <span className="case-file__posted">{formatPostedAt(selected)}</span>
                              )}
                            </p>
                          </div>

                          <div className="case-file__tags">
                            <span className="tag">{posting.workplace_type}</span>
                            <span className="tag">{posting.employment_type.replace("_", " ")}</span>
                            {formatSalary(selected) && (
                              <span className="tag tag--accent">{formatSalary(selected)}</span>
                            )}
                          </div>

                          <div className="case-file__description">
                            {posting.description ? (
                              <ReactMarkdown>{posting.description}</ReactMarkdown>
                            ) : (
                              "No description was extracted for this posting."
                            )}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </article>
            )}
        </div>
      </div>
    </div>
  );
}
