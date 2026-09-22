import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { applicationsApi } from "../api/applications";
import { jobsApi } from "../api/jobs";
import type { Application, JobDetail, JobPosting, User } from "../api/types";

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

// created_at is a real timestamp (not a date-only string like posted_at), so
// this formats in the viewer's own local time zone rather than pinning UTC.
function formatApplicationDate(application: Application): string {
  const date = new Date(application.created_at);
  return `Added ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function SimilarJobsList({ items, onSelect }: { items: JobDetail[]; onSelect?: (urlId: string) => void }) {
  return (
    <ul className="case-file__similar-list">
      {items.map((item) => (
        <li key={item.url.id} className="case-file__similar-item">
          {/* onSelect is only given from JobBoardPage, where picking one swaps
              the split-pane's selection instead of leaving the board (see its
              own selectJob) — everywhere else (JobDetailPage's standalone
              deep link) this just navigates to that job's own page. */}
          {onSelect ? (
            <button type="button" className="case-file__similar-link" onClick={() => onSelect(item.url.id)}>
              {item.posting?.title ?? "Untitled role"}
            </button>
          ) : (
            <Link to={`/jobs/${item.url.id}`} className="case-file__similar-link">
              {item.posting?.title ?? "Untitled role"}
            </Link>
          )}
          <span className="case-file__similar-meta">
            {item.posting?.company_name ?? item.url.domain}
            {item.posting?.location ? ` · ${item.posting.location}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SimilarJobsSection({
  jobId,
  companyName,
  onSelect,
}: {
  jobId: string;
  companyName: string | null;
  onSelect?: (urlId: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["similar-jobs", jobId],
    queryFn: () => jobsApi.similar(jobId),
  });
  const sameCompany = data?.same_company ?? [];
  const similarTitle = data?.similar_title ?? [];
  if (sameCompany.length === 0 && similarTitle.length === 0) return null;

  return (
    <div className="case-file__similar">
      {sameCompany.length > 0 && (
        <div className="case-file__similar-group">
          <h2>{companyName ? `More from ${companyName}` : "More from this company"}</h2>
          <SimilarJobsList items={sameCompany} onSelect={onSelect} />
        </div>
      )}
      {similarTitle.length > 0 && (
        <div className="case-file__similar-group">
          <h2>Similar roles elsewhere</h2>
          <SimilarJobsList items={similarTitle} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

export function JobCaseFile({
  job,
  user,
  isRescanning,
  rescanFailed,
  onRescan,
  onDelete,
  isDeleting,
  onSelectSimilar,
}: {
  job: JobDetail;
  user: User | null;
  isRescanning: boolean;
  rescanFailed: boolean;
  onRescan: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  // See SimilarJobsList — only set from JobBoardPage.
  onSelectSimilar?: (urlId: string) => void;
}) {
  const posting = scannedPosting(job);
  const scanFailed = job.url.scan_status === "failed";

  // Same list ApplyPage/ApplicationsPage query (same ["applications"] cache
  // key), just to answer one question here: has this posting already been
  // saved/applied to? (Visiting ApplyPage auto-saves it — see its own
  // effect — so "Evaluate Job" is the wrong label the moment that's true.)
  const { data: applications } = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
    enabled: !!user,
  });
  const currentApplication = applications?.find((a) => a.job_posting.url_id === job.url.id) ?? null;

  return (
    <article className="case-file">
      {(!posting || scanFailed) && (
        <div className="case-file__header">
          <div className="case-file__header-left-group">
            <span className="stamp stamp--neutral">{scanFailed ? "Scan failed" : "Scanning…"}</span>
            {user?.role === "admin" && onDelete && (
              <button
                type="button"
                className="rescan-button rescan-button--danger"
                disabled={isDeleting}
                onClick={onDelete}
              >
                {isDeleting ? "Deleting…" : "Delete listing"}
              </button>
            )}
          </div>
          {user && (
            <button type="button" className="rescan-button" disabled={isRescanning} onClick={onRescan}>
              {isRescanning ? "Rescanning…" : "Rescan ↻"}
            </button>
          )}
        </div>
      )}
      {scanFailed && job.url.scan_error && <p className="rescan-error">{job.url.scan_error}</p>}
      {rescanFailed && <p className="rescan-error">Rescan failed — try again in a moment.</p>}
      {posting && !scanFailed && (
        <>
          <div className="case-file__toolbar">
            <div className="case-file__header-left">
              {user && (
                <button type="button" className="rescan-button" disabled={isRescanning} onClick={onRescan}>
                  {isRescanning ? "Rescanning…" : "Rescan ↻"}
                </button>
              )}
            </div>
            <div className="case-file__header-actions">
              <a href={job.url.url} target="_blank" rel="noopener noreferrer" className="rescan-button">
                Original ↗
              </a>
              <Link to={`/jobs/${job.url.id}/apply`} className="apply-button">
                <span>{currentApplication ? "View application →" : "Evaluate Job →"}</span>
                {currentApplication && (
                  <span className="apply-button__meta">{formatApplicationDate(currentApplication)}</span>
                )}
              </Link>
            </div>
          </div>

          <div className="case-file__header-title">
            <h1>{posting.title ?? "Untitled role"}</h1>
            <p className="case-file__company">
              <span>
                {posting.company_name ?? job.url.domain}
                {posting.location ? ` · ${posting.location}` : ""}
              </span>
              {formatPostedAt(job) && <span className="case-file__posted">{formatPostedAt(job)}</span>}
            </p>
          </div>

          <div className="case-file__tags">
            <span className="tag">{posting.workplace_type}</span>
            <span className="tag">{posting.employment_type.replace("_", " ")}</span>
            {formatSalary(job) && <span className="tag tag--accent">{formatSalary(job)}</span>}
          </div>

          <div className="case-file__description">
            {posting.description ? (
              <ReactMarkdown>{posting.description}</ReactMarkdown>
            ) : (
              "No description was extracted for this posting."
            )}
          </div>

          <SimilarJobsSection
            jobId={job.url.id}
            companyName={posting.company_name}
            onSelect={onSelectSimilar}
          />

          {user?.role === "admin" && onDelete && (
            <div className="case-file__footer">
              <button
                type="button"
                className="rescan-button rescan-button--danger"
                disabled={isDeleting}
                onClick={onDelete}
              >
                {isDeleting ? "Deleting…" : "Delete listing"}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
