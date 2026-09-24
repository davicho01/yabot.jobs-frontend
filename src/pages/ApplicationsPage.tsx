import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type { Application, ApplicationJobPosting, ApplicationStatus } from "../api/types";
import { StatusSelect } from "../components/StatusSelect";
import { STATUSES, statusTone } from "../utils/applicationStatus";
import "./ApplicationsPage.css";
import { BOARD_PATH } from "../routes";

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

// applied_at is a real timestamp (unlike posted_at/follow_up_at above,
// which are date-only), but the list row only has room for the day — see
// ApplyPage's formatAppliedAt for the full date+time version shown there.
// No UTC-pinning needed here: it already carries its own offset, so the
// viewer's local calendar day is the right one to show.
function formatAppliedDate(appliedAt: string): string {
  return new Date(appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// follow_up_at is also a date-only string — same UTC-pinning as above, plus
// whether it's already due (today or earlier), matching the backend sweep's
// own <= today check (app.services.follow_up_reminders) — compared in UTC
// like that check is, not the viewer's own local "today".
function formatFollowUp(followUpAt: string): { text: string; overdue: boolean } {
  const date = new Date(`${followUpAt}T00:00:00Z`);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    text: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    overdue: date.getTime() <= todayUtc,
  };
}

function formatSalary(posting: ApplicationJobPosting): string | null {
  if (!posting.salary_min && !posting.salary_max) return null;
  const currency = posting.salary_currency ?? "";
  if (posting.salary_min && posting.salary_max) {
    return `${currency} ${posting.salary_min.toLocaleString()}–${posting.salary_max.toLocaleString()}`;
  }
  return `${currency} ${(posting.salary_min ?? posting.salary_max)?.toLocaleString()}`;
}

type SortableField = "score" | "pay" | "posted" | "followUp";
type SortDirection = "asc" | "desc";
type ActiveSort = { field: SortableField; direction: SortDirection };

const SORT_FIELD_LABELS: Record<SortableField, string> = {
  score: "Score",
  pay: "Pay range",
  posted: "Posted date",
  followUp: "Follow-up date",
};

const SORT_FIELDS = Object.keys(SORT_FIELD_LABELS) as SortableField[];

function isSortField(value: string): value is SortableField {
  return value === "score" || value === "pay" || value === "posted" || value === "followUp";
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

const CSV_HEADER = [
  "Title",
  "Company",
  "Status",
  "Score",
  "Salary min",
  "Salary max",
  "Currency",
  "Posted",
  "Applied",
  "Apply URL",
  "Archived",
  "Follow up",
  "Notes",
];

// Quotes a cell only when it needs it (a comma, quote, or newline in the
// value) — RFC 4180's minimal form, and what every spreadsheet app expects.
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function applicationsToCsv(applications: Application[]): string {
  const rows = applications.map((application) => [
    application.job_posting.title ?? "",
    application.job_posting.company_name ?? "",
    application.status,
    application.best_score ?? "",
    application.job_posting.salary_min ?? "",
    application.job_posting.salary_max ?? "",
    application.job_posting.salary_currency ?? "",
    application.job_posting.posted_at ?? "",
    application.applied_at ?? "",
    application.job_posting.apply_url,
    application.is_archived ? "Yes" : "No",
    application.follow_up_at ?? "",
    application.notes ?? "",
  ]);
  // \r\n per RFC 4180; a leading BOM so Excel opens it as UTF-8 rather than
  // mis-decoding an accented company/job name under its own default codepage.
  return "﻿" + [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sortValue(application: Application, field: SortableField): number | null {
  switch (field) {
    case "score":
      return application.best_score;
    case "pay":
      return application.job_posting.salary_max ?? application.job_posting.salary_min ?? null;
    case "posted":
      return application.job_posting.posted_at ? new Date(`${application.job_posting.posted_at}T00:00:00Z`).getTime() : null;
    case "followUp":
      return application.follow_up_at ? new Date(`${application.follow_up_at}T00:00:00Z`).getTime() : null;
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

// Same status set ApplyPage's Notes card edits — moving it here too
// means a status can be changed straight from the list, without opening
// each job. Wraps the shared dropdown-button StatusSelect (same
// action-dropdown pattern as DownloadMenu below, tinted per status like
// the marketing site's stamp mocks) instead of a plain native <select>.
function ApplicationStatusSelect({ application }: { application: Application }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (status: ApplicationStatus) => applicationsApi.update(application.id, { status }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => setError(errorMessage(err, "Couldn't update status.")),
  });

  return (
    <div className="application-row__status">
      <StatusSelect
        value={application.status as ApplicationStatus}
        disabled={mutation.isPending}
        onChange={(status) => mutation.mutate(status)}
      />
      {error && <span className="application-row__details-error">{error}</span>}
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
    onError: (err) => setError(errorMessage(err, "Couldn't score this job.")),
  });

  return (
    <div className="application-row__score">
      <button
        type="button"
        className="application-row__action"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Scoring…" : "Score"}
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

// One PATCH /applications/bulk-update request for every selected id, not
// one applicationsApi.update call fanned out per id client-side — archive/
// unarchive's payload is fixed at the hook call site (below), unlike
// useBulkStatusMutation's, which isn't known until BulkStatusMenu's
// dropdown picks one.
function useBulkUpdateMutation(payload: { is_archived: boolean }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => applicationsApi.bulkUpdate(ids, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

// Same bulk-update endpoint as useBulkUpdateMutation above, just with the
// status to apply passed at mutate time instead of baked into the hook
// call site, since it isn't known until the user picks one from
// BulkStatusMenu's dropdown.
function useBulkStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ApplicationStatus }) =>
      applicationsApi.bulkUpdate(ids, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

// Same action-dropdown pattern as SortMenu/DownloadMenu above — a menu of
// every ApplicationStatus (STATUSES, the same list StatusSelect's per-row
// dropdown uses) rather than StatusSelect itself, since there's no single
// "current" status to highlight when the selection spans rows in different
// states.
function BulkStatusMenu({ disabled, onPick }: { disabled: boolean; onPick: (status: ApplicationStatus) => void }) {
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

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button type="button" className="application-row__action" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        Set status ↓
      </button>
      {open && (
        <div className="action-dropdown-menu status-select__menu">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`status-select__option status-select__option--${statusTone(status)}`}
              onClick={() => {
                setOpen(false);
                onPick(status);
              }}
            >
              <span className="status-select__option-dot" aria-hidden="true" />
              {status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkActionsBar({
  selectedIds,
  applications,
  onClear,
}: {
  selectedIds: Set<string>;
  applications: Application[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const archiveMutation = useBulkUpdateMutation({ is_archived: true });
  const unarchiveMutation = useBulkUpdateMutation({ is_archived: false });
  const statusMutation = useBulkStatusMutation();
  const evaluateMutation = useMutation({
    // Only the ones without a score yet — matches how the per-row Evaluate
    // button already only appears in that case, so this never re-spends an
    // LLM call on something already scored.
    mutationFn: (jobPostingIds: string[]) => Promise.all(jobPostingIds.map((id) => resumesApi.generateScore(id))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const anyPending =
    archiveMutation.isPending || unarchiveMutation.isPending || statusMutation.isPending || evaluateMutation.isPending;
  const selected = applications.filter((a) => selectedIds.has(a.id));
  const unscoredJobPostingIds = selected.filter((a) => a.best_score === null).map((a) => a.job_posting.id);

  function runBulk(mutate: () => Promise<unknown>) {
    setError(null);
    mutate()
      .then(onClear)
      .catch((err) => setError(errorMessage(err, "That didn't fully go through — some rows may be unchanged.")));
  }

  return (
    <div className="applications-page__bulk-bar">
      <span className="applications-page__bulk-count">{selectedIds.size} selected</span>
      <BulkStatusMenu
        disabled={anyPending}
        onPick={(status) => runBulk(() => statusMutation.mutateAsync({ ids: [...selectedIds], status }))}
      />
      <button
        type="button"
        className="application-row__action"
        disabled={anyPending}
        onClick={() => runBulk(() => archiveMutation.mutateAsync([...selectedIds]))}
      >
        {archiveMutation.isPending ? "Archiving…" : "Archive"}
      </button>
      <button
        type="button"
        className="application-row__action"
        disabled={anyPending}
        onClick={() => runBulk(() => unarchiveMutation.mutateAsync([...selectedIds]))}
      >
        {unarchiveMutation.isPending ? "Unarchiving…" : "Unarchive"}
      </button>
      <button
        type="button"
        className="application-row__action"
        disabled={anyPending || unscoredJobPostingIds.length === 0}
        onClick={() => runBulk(() => evaluateMutation.mutateAsync(unscoredJobPostingIds))}
        title={unscoredJobPostingIds.length === 0 ? "Everything selected already has a score" : undefined}
      >
        {evaluateMutation.isPending ? "Evaluating…" : `Evaluate${unscoredJobPostingIds.length ? ` (${unscoredJobPostingIds.length})` : ""}`}
      </button>
      <button type="button" className="applications-page__bulk-clear" onClick={onClear}>
        Clear
      </button>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // The view (which fields/directions are active, whether archived rows
  // show) lives in the URL so it survives a refresh or back/forward nav,
  // matching how the job board persists its own filters.
  const showArchived = searchParams.get("archived") === "1";
  const activeSorts = parseActiveSorts(searchParams.get("sort"));

  // Archived applications stay in the same list (so an archived job's own
  // ApplyPage can still look up and unarchive it) — this page just
  // hides them from the default view unless the checkbox below is checked.
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

  // Exports exactly what's currently on screen (the archived toggle and any
  // active sort already applied), not the unfiltered full list underneath.
  function handleExportCsv() {
    if (!applications?.length) return;
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`yabot-applications-${today}.csv`, applicationsToCsv(applications));
  }

  function handleShowArchivedChange(checked: boolean) {
    setSelectedIds(new Set());
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = !!applications?.length && applications.every((a) => selectedIds.has(a.id));

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(applications?.map((a) => a.id)));
  }

  return (
    <main className="applications-page">
        <div className="applications-page__header">
          <div>
            <h1>My applications</h1>
            <p className="applications-page__intro">Every posting you've saved or applied to, in one drawer.</p>
          </div>
          <Link to="/resume-optimization" className="applications-page__evaluate-button">
            Resume optimization
          </Link>
        </div>

        <div className="applications-page__toolbar">
          <label className="applications-page__archive-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => handleShowArchivedChange(e.target.checked)}
            />
            Show archived
          </label>
          <label className="applications-page__archive-toggle">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={!applications?.length}
              onChange={toggleSelectAll}
            />
            Select all
          </label>
          <SortMenu activeSorts={activeSorts} onCycleField={handleCycleSortField} />
          <button
            type="button"
            className="application-row__action"
            disabled={!applications?.length}
            onClick={handleExportCsv}
          >
            Export CSV ↓
          </button>
        </div>

        {selectedIds.size > 0 && applications && (
          <BulkActionsBar
            selectedIds={selectedIds}
            applications={applications}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {isLoading && <p>Loading…</p>}
        {!isLoading && applications?.length === 0 && (
          <p className="applications-page__empty">
            Nothing here yet — <Link to={BOARD_PATH}>browse postings</Link> and hit Apply on one that fits.
          </p>
        )}

        <ul className="application-list">
          {applications?.map((application) => (
            <li key={application.id} className="application-row">
              <input
                type="checkbox"
                className="application-row__select"
                aria-label={`Select ${application.job_posting.title ?? "this application"}`}
                checked={selectedIds.has(application.id)}
                onChange={() => toggleSelect(application.id)}
              />
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
                  {application.applied_at && (
                    <span className="application-row__applied">Applied {formatAppliedDate(application.applied_at)}</span>
                  )}
                  {application.follow_up_at && (
                    <span
                      className={`application-row__follow-up${
                        formatFollowUp(application.follow_up_at).overdue ? " application-row__follow-up--due" : ""
                      }`}
                    >
                      Follow up {formatFollowUp(application.follow_up_at).text}
                    </span>
                  )}
                </div>
              </div>
              <ApplicationStatusSelect application={application} />
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
