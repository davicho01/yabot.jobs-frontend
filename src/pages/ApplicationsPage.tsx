import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type { Application, ApplicationJobPosting } from "../api/types";
import "./ApplicationsPage.css";

const QUALIFY_THRESHOLD = 70;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// posted_at is a date-only string (YYYY-MM-DD) — parsing it as UTC and
// formatting with the same zone keeps the displayed day from shifting
// backward for anyone west of UTC.
function formatPostedDate(postedAt: string): string {
  const date = new Date(`${postedAt}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatSalary(posting: ApplicationJobPosting): string | null {
  if (!posting.salary_min && !posting.salary_max) return null;
  const currency = posting.salary_currency ?? "";
  if (posting.salary_min && posting.salary_max) {
    return `${currency} ${posting.salary_min.toLocaleString()}–${posting.salary_max.toLocaleString()}`;
  }
  return `${currency} ${(posting.salary_min ?? posting.salary_max)?.toLocaleString()}`;
}

type SortableField = "score" | "pay" | "posted";
type SortDirection = "asc" | "desc";
type ActiveSort = { field: SortableField; direction: SortDirection };

const SORT_FIELD_LABELS: Record<SortableField, string> = {
  score: "Score",
  pay: "Pay range",
  posted: "Posted date",
};

const SORT_FIELDS = Object.keys(SORT_FIELD_LABELS) as SortableField[];

function isSortField(value: string): value is SortableField {
  return value === "score" || value === "pay" || value === "posted";
}

// "sort=score:desc,pay:asc" — order in the list is sort priority (first
// entry wins ties, later entries only break ties left by earlier ones).
function parseActiveSorts(raw: string | null): ActiveSort[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part): ActiveSort | null => {
      const [field, direction] = part.split(":");
      if (!isSortField(field)) return null;
      return { field, direction: direction === "asc" ? "asc" : "desc" };
    })
    .filter((sort): sort is ActiveSort => sort !== null);
}

function serializeActiveSorts(sorts: ActiveSort[]): string {
  return sorts.map((sort) => `${sort.field}:${sort.direction}`).join(",");
}

function sortValue(application: Application, field: SortableField): number | null {
  switch (field) {
    case "score":
      return application.best_score;
    case "pay":
      return application.job_posting.salary_max ?? application.job_posting.salary_min ?? null;
    case "posted":
      return application.job_posting.posted_at ? new Date(`${application.job_posting.posted_at}T00:00:00Z`).getTime() : null;
  }
}

function SortMenu({
  activeSorts,
  onCycleField,
}: {
  activeSorts: ActiveSort[];
  onCycleField: (field: SortableField) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const triggerLabel =
    activeSorts.length === 0
      ? "Sort ↓"
      : `Sort: ${activeSorts.map((sort) => SORT_FIELD_LABELS[sort.field]).join(" → ")}`;

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button type="button" className="application-row__action" onClick={() => setOpen((o) => !o)}>
        {triggerLabel}
      </button>
      {open && (
        <div className="action-dropdown-menu">
          {SORT_FIELDS.map((field) => {
            const active = activeSorts.find((sort) => sort.field === field);
            return (
              <button key={field} type="button" onClick={() => onCycleField(field)}>
                {SORT_FIELD_LABELS[field]}
                {active ? ` ${active.direction === "desc" ? "↓" : "↑"}` : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvaluateButton({ jobPostingId }: { jobPostingId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => resumesApi.generateScore(jobPostingId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => setError(errorMessage(err, "Couldn't evaluate this job.")),
  });

  return (
    <div className="application-row__score">
      <button
        type="button"
        className="application-row__action"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Evaluating…" : "Evaluate"}
      </button>
      {error && <span className="application-row__details-error">{error}</span>}
    </div>
  );
}

// Score/tailored-resume/cover-letter all arrive nested on the application
// itself (backend keeps a "latest" pointer per application, updated when
// each is generated — see UserJobApplication.latest_score etc.), so this is
// pure rendering aside from the "not generated yet" actions below.
function DownloadMenu({ application }: { application: Application }) {
  const { latest_tailored_resume: tailoredResume, latest_cover_letter: coverLetter, job_posting: jobPosting } =
    application;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const createTailoredMutation = useMutation({
    mutationFn: () => resumesApi.generateTailored(jobPosting.id),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => setError(errorMessage(err, "Couldn't create the resume.")),
  });

  const createCoverLetterMutation = useMutation({
    mutationFn: () => resumesApi.generateCoverLetter(jobPosting.id),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => setError(errorMessage(err, "Couldn't create the cover letter.")),
  });

  return (
    <div className="action-dropdown application-row__download" ref={containerRef}>
      <button type="button" className="application-row__action" onClick={() => setOpen((o) => !o)}>
        Download ↓
      </button>
      {open && (
        <div className="action-dropdown-menu">
          {tailoredResume ? (
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                setError(null);
                try {
                  await resumesApi.downloadTailored(tailoredResume.id, tailoredResume.filename);
                } catch {
                  setError("Couldn't download the resume.");
                }
              }}
            >
              Resume
            </button>
          ) : (
            <button type="button" disabled={createTailoredMutation.isPending} onClick={() => createTailoredMutation.mutate()}>
              {createTailoredMutation.isPending ? "Creating…" : "Create resume"}
            </button>
          )}
          {coverLetter ? (
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                setError(null);
                try {
                  await resumesApi.downloadCoverLetter(coverLetter.id, coverLetter.filename);
                } catch {
                  setError("Couldn't download the cover letter.");
                }
              }}
            >
              Cover letter
            </button>
          ) : (
            <button
              type="button"
              disabled={createCoverLetterMutation.isPending}
              onClick={() => createCoverLetterMutation.mutate()}
            >
              {createCoverLetterMutation.isPending ? "Creating…" : "Create cover letter"}
            </button>
          )}
        </div>
      )}
      {error && <span className="application-row__details-error">{error}</span>}
    </div>
  );
}

export function ApplicationsPage() {
  const { data: allApplications, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // The view (which fields/directions are active, whether archived rows
  // show) lives in the URL so it survives a refresh or back/forward nav,
  // matching how the job board persists its own filters.
  const showArchived = searchParams.get("archived") === "1";
  const activeSorts = parseActiveSorts(searchParams.get("sort"));

  // Archived applications stay in the same list (so an archived job's own
  // /apply page can still look up and unarchive it) — this page just hides
  // them from the default view unless the checkbox below is checked.
  const applications = allApplications?.filter((application) => showArchived || !application.is_archived);

  // Multi-key sort: each checked field is a tiebreaker for the ones before
  // it, in the order they were added. A row missing a given field's value
  // always sinks below one that has it, for that key specifically.
  if (applications && activeSorts.length > 0) {
    applications.sort((a, b) => {
      for (const { field, direction } of activeSorts) {
        const av = sortValue(a, field);
        const bv = sortValue(b, field);
        if (av === null && bv === null) continue;
        if (av === null) return 1;
        if (bv === null) return -1;
        const delta = av - bv;
        if (delta !== 0) return direction === "desc" ? -delta : delta;
      }
      return 0;
    });
  }

  function updateActiveSorts(next: ActiveSort[]) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next.length === 0) params.delete("sort");
        else params.set("sort", serializeActiveSorts(next));
        return params;
      },
      { replace: true },
    );
  }

  // Cycles a field through desc → asc → removed → desc … each click, and
  // preserves its position in the priority list while it stays active.
  function handleCycleSortField(field: SortableField) {
    const current = activeSorts.find((sort) => sort.field === field);
    if (!current) {
      updateActiveSorts([...activeSorts, { field, direction: "desc" }]);
    } else if (current.direction === "desc") {
      updateActiveSorts(activeSorts.map((sort) => (sort.field === field ? { ...sort, direction: "asc" } : sort)));
    } else {
      updateActiveSorts(activeSorts.filter((sort) => sort.field !== field));
    }
  }

  function handleShowArchivedChange(checked: boolean) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (checked) next.set("archived", "1");
        else next.delete("archived");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <main className="applications-page">
        <h1>My applications</h1>
        <p className="applications-page__intro">Every posting you've saved or applied to, in one drawer.</p>

        <div className="applications-page__toolbar">
          <label className="applications-page__archive-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => handleShowArchivedChange(e.target.checked)}
            />
            Show archived
          </label>
          <SortMenu activeSorts={activeSorts} onCycleField={handleCycleSortField} />
        </div>

        {isLoading && <p>Loading…</p>}
        {!isLoading && applications?.length === 0 && (
          <p className="applications-page__empty">
            Nothing here yet — <Link to="/">browse postings</Link> and hit Apply on one that fits.
          </p>
        )}

        <ul className="application-list">
          {applications?.map((application) => (
            <li key={application.id} className="application-row">
              <div className="application-row__main">
                <span className="application-row__title-row">
                  <Link to={`/jobs/${application.job_posting.url_id}/apply`} className="application-row__title">
                    {application.job_posting.title ?? "Untitled role"}
                  </Link>
                  {application.is_archived && <span className="application-row__archived-badge">Archived</span>}
                </span>
                <div className="application-row__meta">
                  {application.job_posting.company_name && (
                    <span className="application-row__company">{application.job_posting.company_name}</span>
                  )}
                  {formatSalary(application.job_posting) ? (
                    <span className="application-row__pay">{formatSalary(application.job_posting)}</span>
                  ) : (
                    <span className="application-row__details-hint">Pay not listed</span>
                  )}
                  {application.job_posting.posted_at && (
                    <span className="application-row__added">Posted {formatPostedDate(application.job_posting.posted_at)}</span>
                  )}
                </div>
              </div>
              <DownloadMenu application={application} />
              {application.best_score !== null ? (
                <span
                  className={`stamp application-row__score ${
                    application.best_score >= QUALIFY_THRESHOLD ? "stamp--positive" : "stamp--negative"
                  }`}
                >
                  Score {application.best_score}
                </span>
              ) : (
                <EvaluateButton jobPostingId={application.job_posting.id} />
              )}
              <a
                href={application.job_posting.apply_url}
                target="_blank"
                rel="noreferrer"
                className="application-row__apply-button"
              >
                Apply →
              </a>
            </li>
          ))}
        </ul>
    </main>
  );
}
