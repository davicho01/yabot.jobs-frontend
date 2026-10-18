import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type {
  Application,
  ApplicationJobPosting,
  ApplicationStatus,
  AutoScoreRun,
  AutoScoreStatus,
} from "../api/types";
import { StatusSelect } from "../components/StatusSelect";
import { STATUSES, statusTone } from "../utils/applicationStatus";
import { formatFollowUp } from "../utils/followUp";
import { fitTier } from "../utils/fitScore";
import {
  AUTO_SCORE_POLL_MS,
  isAutoScoreActive,
  previewAutoScoreStatus,
  useShownAutoScoreStatus,
} from "../utils/autoScore";
import "./ApplicationsPage.css";
import { BOARD_PATH } from "../routes";
import CompanyLogo from "../components/CompanyLogo";
import { listColor, listColorEnd } from "../utils/listGradient";
import { ApplyButton } from "../components/ApplyButton";

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
      ? // The API's own order, newest saved first.
        "Sort: Newest ↓"
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

// Where the application stands in the apply page's steps — the four the list
// knows about (interview prep isn't sent with it) — and the next one to do.
// `section` is where the "Next:" link opens the apply page (see ApplyPage2's
// #step-N / #notes handling).
const TRACK_STEPS = [
  { label: "Score", next: "score it", section: "step-1", done: (a: Application) => a.best_score !== null },
  {
    label: "Tailor",
    next: "tailor resume",
    section: "step-2",
    done: (a: Application) => a.latest_tailored_resume !== null,
  },
  {
    label: "Cover letter",
    next: "cover letter",
    section: "step-3",
    done: (a: Application) => a.latest_cover_letter !== null,
  },
  { label: "Apply", next: "apply", section: "step-4", done: (a: Application) => a.status !== "saved" },
];

// What to do next. Before applying, the first step not done yet. After, the
// steps before Apply are behind you (a skipped cover letter isn't "next"
// once you've applied), so it follows the status instead.
function nextStep(
  application: Application,
  done: boolean[],
): { text: string; section: string | null; done?: boolean } | null {
  // A poor match (the red fit tier), saved or applied, isn't nudged on to
  // more work; the choice to keep going is yours, from the card's menu or its
  // job page. An interview or offer outranks the score.
  if (
    (application.status === "saved" || application.status === "applied") &&
    application.best_score !== null &&
    fitTier(application.best_score) === "negative"
  ) {
    return { text: "Not a match", section: null };
  }
  switch (application.status) {
    case "saved": {
      const step = TRACK_STEPS.find((_, i) => !done[i]);
      return step ? { text: `Next: ${step.next}`, section: step.section } : null;
    }
    case "applied":
      if (!application.follow_up_at) return { text: "Next: set a follow-up", section: "notes" };
      // Every step is done; a due follow-up shows as the red date link above.
      return { text: "Completed!", section: null, done: true };
    case "interviewing":
      return { text: "Next: interview prep", section: "step-5" };
    case "offer":
      return { text: "Offer received", section: null };
    default:
      return null;
  }
}

function StepTracker({ application }: { application: Application }) {
  const done = TRACK_STEPS.map((step) => step.done(application));
  // A job ready to apply shows the Apply button (RowControls); a "Next:" link
  // beside it would be a second, competing call to action, so the dashes are
  // labeled "Ready to apply" instead (the cover letter is optional).
  const ready = showApply(application);
  const next = ready ? null : nextStep(application, done);
  const count = done.filter(Boolean).length;
  return (
    <div className="application-row__track">
      <ol className="application-row__track-steps" aria-label={`${count} of ${TRACK_STEPS.length} steps done`}>
        {TRACK_STEPS.map((step, i) => (
          <li
            key={step.label}
            className={`application-row__track-step${done[i] ? " application-row__track-step--done" : ""}${
              next?.section === step.section ? " application-row__track-step--next" : ""
            }`}
            title={`${step.label}${done[i] ? " · done" : ""}`}
          />
        ))}
      </ol>
      {next?.section ? (
        <Link
          to={`/jobs/${application.job_posting.url_id}/apply#${next.section}`}
          className="application-row__track-next"
        >
          {next.text} →
        </Link>
      ) : ready ? (
        <span className="application-row__track-next application-row__track-next--ready">Ready to apply</span>
      ) : (
        next && (
          <span
            className={`application-row__track-next ${next.done ? "application-row__track-next--ready" : "application-row__track-next--quiet"}`}
          >
            {next.text}
          </span>
        )
      )}
    </div>
  );
}

// The header's count tiles double as the list's filters: tapping one shows
// just what it counts (kept in the URL as ?show=), tapping it again shows
// everything. `empty` is what the list says when a filter matches nothing.
const LIST_FILTERS = [
  { value: "saved", label: "Saved", empty: "Nothing saved right now.", match: (a: Application) => a.status === "saved" },
  {
    value: "applied",
    label: "Applied",
    empty: "Nothing waiting to hear back right now.",
    match: (a: Application) => a.status === "applied",
  },
  {
    value: "interviewing",
    label: "Interviewing",
    empty: "No interviews right now.",
    match: (a: Application) => a.status === "interviewing",
  },
  { value: "offer", label: "Offers", empty: "No offers right now.", match: (a: Application) => a.status === "offer" },
  {
    value: "followups",
    label: "Follow-ups due",
    empty: "No follow-ups due right now.",
    match: (a: Application) => !!a.follow_up_at && formatFollowUp(a.follow_up_at).overdue,
    urgent: true,
  },
];

// The toolbar's ⋯ menu: the list's less frequent controls (archived rows,
// selecting rows for bulk actions, CSV export) behind one button, so Sort and
// the menu fit on one line on a phone. Same action-dropdown pattern as SortMenu.
function ListMenu({
  showArchived,
  onShowArchivedChange,
  onSelect,
  onExportCsv,
  hasRows,
}: {
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  onSelect: () => void;
  onExportCsv: () => void;
  hasRows: boolean;
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

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button
        type="button"
        className="application-row__action application-row__more"
        aria-label="More list options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="action-dropdown-menu applications-page__list-menu" role="menu">
          <Link to="/resume-optimization" role="menuitem" onClick={() => setOpen(false)}>
            <span className="applications-page__check" aria-hidden="true" />
            Resume optimization
          </Link>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showArchived}
            onClick={() => onShowArchivedChange(!showArchived)}
          >
            <span className="applications-page__check" aria-hidden="true">
              {showArchived ? "✓" : ""}
            </span>
            Show archived
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasRows}
            onClick={() => {
              onSelect();
              setOpen(false);
            }}
          >
            <span className="applications-page__check" aria-hidden="true" />
            Select
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasRows}
            onClick={() => {
              onExportCsv();
              setOpen(false);
            }}
          >
            <span className="applications-page__check" aria-hidden="true" />
            Export CSV
          </button>
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

// The card's Apply → (see ApplyButton for what a click does). Green when
// auto score marked the application ready.
function ApplyLink({ application }: { application: Application }) {
  const ready = application.ready_to_apply_at !== null;
  return (
    <ApplyButton
      className={`application-row__apply-button${ready ? " application-row__apply-button--ready" : ""}`}
      target={{
        href: application.job_posting.apply_url,
        title: application.job_posting.title,
        company: application.job_posting.company_name,
        application: { id: application.id, status: application.status },
        tailored: application.latest_tailored_resume,
      }}
    />
  );
}

// This job's latest auto score run (null if it never had one). Starts from
// the run the applications list sent along (application.auto_score), so a
// page load makes no per-card requests; only a run in progress is polled.
// Read by both the card's Score button and its progress bar — same query
// key, so one poll serves both.
function useAutoScoreRun(application: Application) {
  const jobPostingId = application.job_posting.id;
  return useQuery<AutoScoreRun | null>({
    queryKey: ["auto-score", jobPostingId],
    initialData: application.auto_score ?? null,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        return await resumesApi.getAutoScore(jobPostingId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    retry: false,
    refetchInterval: (query) => (isAutoScoreActive(query.state.data?.status) ? AUTO_SCORE_POLL_MS : false),
  });
}

const PROGRESS_STEPS = ["Score", "Tailor", "Score tailored"];

// Which of PROGRESS_STEPS a run is on.
const PROGRESS_STEP_INDEX: Partial<Record<AutoScoreStatus, number>> = {
  queued: 0,
  scoring: 0,
  tailoring: 1,
  scoring_tailored: 2,
};

// The card's corner score. Mid-run, once the first score is in (the bar is
// past "Score"), shows that score instead of waiting for the run to end;
// otherwise the application's best score. Same query as the bar and the
// Score button, so no extra requests.
function CardScore({ application }: { application: Application }) {
  const run = useAutoScoreRun(application).data;
  const shownStatus = useShownAutoScoreStatus(run?.status);
  const status = previewAutoScoreStatus() ?? shownStatus;
  const pastFirstScore = status === "tailoring" || status === "scoring_tailored";
  const score = pastFirstScore && run?.resume_score != null ? run.resume_score : application.best_score;
  if (score === null) return null;
  return (
    <span className={`application-row__fit application-row__fit--${fitTier(score)}`}>
      <i aria-hidden="true" />
      {score} fit
    </span>
  );
}

// Three segments along the card's top edge while its auto score runs: done
// ones green, the current one blue and pulsing, the rest grey. Gone once
// the run ends — the corner score and green Apply show the result.
function AutoScoreProgress({ application }: { application: Application }) {
  const shownStatus = useShownAutoScoreStatus(useAutoScoreRun(application).data?.status);
  const status = previewAutoScoreStatus() ?? shownStatus;
  const current = status === undefined ? undefined : PROGRESS_STEP_INDEX[status];
  if (current === undefined) return null;
  return (
    <ol className="application-row__progress" aria-label={`Auto score: ${PROGRESS_STEPS[current]}`}>
      {PROGRESS_STEPS.map((label, index) => (
        <li
          key={label}
          className={`application-row__progress-step${
            index < current
              ? " application-row__progress-step--done"
              : index === current
                ? " application-row__progress-step--current"
                : ""
          }`}
        >
          <span className="application-row__progress-label">
            {index < current ? "✓ " : ""}
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Starts the same background auto score as the apply page's Score button
// (score → tailor if ≥ 75 → score tailored; ready at ≥ 85), with the
// application's chosen resume. Shares the apply page's ["auto-score", id]
// query, so a run started in either place shows as running in both.
function useScoreAction(application: Application) {
  const queryClient = useQueryClient();
  const jobPostingId = application.job_posting.id;
  const [error, setError] = useState<string | null>(null);

  const runQuery = useAutoScoreRun(application);
  // Stepped like the card's progress bar (each step ≥ 1s), so the button,
  // the bar and the refreshed score all change together.
  const shownStatus = useShownAutoScoreStatus(runQuery.data?.status);
  const status = previewAutoScoreStatus() ?? shownStatus;

  const mutation = useMutation({
    mutationFn: () => resumesApi.startAutoScore(jobPostingId, application.selected_resume_id ?? undefined),
    onSuccess: (run) => {
      setError(null);
      queryClient.setQueryData(["auto-score", jobPostingId], run);
    },
    onError: (err) => setError(errorMessage(err, "Couldn't start scoring this job.")),
  });

  // When a run finishes, reload the list so its score (and green Apply, if
  // it came out ready) shows.
  const lastStatus = useRef(status);
  useEffect(() => {
    const previous = lastStatus.current;
    lastStatus.current = status;
    if (isAutoScoreActive(previous) && !isAutoScoreActive(status)) {
      if (status === "failed" && runQuery.data?.error) setError(runQuery.data.error);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    }
  }, [status, runQuery.data?.error, queryClient]);

  const running = mutation.isPending || isAutoScoreActive(status);
  return {
    running,
    label: application.best_score !== null ? "Re-score" : "Score",
    start: () => mutation.mutate(),
    error,
  };
}

// Score/tailored-resume/cover-letter all arrive nested on the application
// itself (backend keeps a "latest" pointer per application, updated when
// each is generated — see UserJobApplication.latest_score etc.), so this is
// pure rendering aside from the "not generated yet" actions below.
function DownloadMenu({
  application,
  score,
}: {
  application: Application;
  score: ReturnType<typeof useScoreAction>;
}) {
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
      <button
        type="button"
        className="application-row__action application-row__more"
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="action-dropdown-menu">
          <button
            type="button"
            disabled={score.running}
            onClick={() => {
              setOpen(false);
              score.start();
            }}
          >
            {score.running ? "Scoring…" : score.label}
          </button>
          {/* Wherever the row has no Apply button, the posting stays one tap away here. */}
          {!showApply(application) && jobPosting.apply_url && (
            <a
              className="action-dropdown-menu__link"
              href={jobPosting.apply_url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              Open the job posting ↗
            </a>
          )}
          <hr className="action-dropdown-menu__rule" />
          {tailoredResume ? (
            (["docx", "pdf"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  setError(null);
                  try {
                    await resumesApi.downloadTailored(tailoredResume.id, tailoredResume.filename, format);
                  } catch {
                    setError("Couldn't download the resume.");
                  }
                }}
              >
                Resume (.{format})
              </button>
            ))
          ) : (
            <button type="button" disabled={createTailoredMutation.isPending} onClick={() => createTailoredMutation.mutate()}>
              {createTailoredMutation.isPending ? "Creating…" : "Create resume"}
            </button>
          )}
          {coverLetter ? (
            (["docx", "pdf"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  setError(null);
                  try {
                    await resumesApi.downloadCoverLetter(coverLetter.id, coverLetter.filename, format);
                  } catch {
                    setError("Couldn't download the cover letter.");
                  }
                }}
              >
                Cover letter (.{format})
              </button>
            ))
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

// Apply shows only for a job auto score marked ready (best score ≥ 85) that
// you haven't applied to yet; otherwise the ⋯ menu has the posting.
function showApply(application: Application): boolean {
  return application.status === "saved" && application.ready_to_apply_at !== null;
}

// The row's buttons: the status, Apply (when ready), and the ⋯ menu
// holding Score/Re-score, the job posting and the downloads. Owns the score
// action so a run keeps being watched while the menu is closed.
function RowControls({ application }: { application: Application }) {
  const score = useScoreAction(application);
  return (
    <div className="application-row__controls">
      <ApplicationStatusSelect application={application} />
      {score.running && (
        <span className="application-row__scoring">
          Scoring
          <span className="application-row__spin" aria-hidden="true">
            ↻
          </span>
        </span>
      )}
      {showApply(application) && <ApplyLink application={application} />}
      <DownloadMenu application={application} score={score} />
      {score.error && (
        <span className="application-row__details-error application-row__score-error">{score.error}</span>
      )}
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

// Shown while selecting rows (⋯ → Select): the count, Select all, the bulk
// actions, and Done to leave selection mode.
function BulkActionsBar({
  selectedIds,
  applications,
  allSelected,
  onToggleSelectAll,
  onDone,
}: {
  selectedIds: Set<string>;
  applications: Application[];
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onDone: () => void;
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
  const noneSelected = selectedIds.size === 0;
  const selected = applications.filter((a) => selectedIds.has(a.id));
  const unscoredJobPostingIds = selected.filter((a) => a.best_score === null).map((a) => a.job_posting.id);

  function runBulk(mutate: () => Promise<unknown>) {
    setError(null);
    mutate()
      .then(onDone)
      .catch((err) => setError(errorMessage(err, "That didn't fully go through, some rows may be unchanged.")));
  }

  return (
    <div className="applications-page__bulk-bar">
      <span className="applications-page__bulk-count">{selectedIds.size} selected</span>
      <button type="button" className="applications-page__bulk-clear" onClick={onToggleSelectAll}>
        {allSelected ? "Select none" : "Select all"}
      </button>
      <BulkStatusMenu
        disabled={anyPending || noneSelected}
        onPick={(status) => runBulk(() => statusMutation.mutateAsync({ ids: [...selectedIds], status }))}
      />
      <button
        type="button"
        className="application-row__action"
        disabled={anyPending || noneSelected}
        onClick={() => runBulk(() => archiveMutation.mutateAsync([...selectedIds]))}
      >
        {archiveMutation.isPending ? "Archiving…" : "Archive"}
      </button>
      <button
        type="button"
        className="application-row__action"
        disabled={anyPending || noneSelected}
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
      <button type="button" className="application-row__action applications-page__bulk-done" onClick={onDone}>
        Done
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
  // Checkboxes only show while selecting (⋯ → Select), to keep the cards clear.
  const [selecting, setSelecting] = useState(false);

  function stopSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  // The view (which fields/directions are active, whether archived rows
  // show) lives in the URL so it survives a refresh or back/forward nav,
  // matching how the job board persists its own filters.
  const showArchived = searchParams.get("archived") === "1";
  const activeSorts = parseActiveSorts(searchParams.get("sort"));

  // Archived applications stay in the same list (so an archived job's own
  // ApplyPage can still look up and unarchive it) — this page just
  // hides them from the default view unless the checkbox below is checked.
  const showFilter = LIST_FILTERS.find((filter) => filter.value === searchParams.get("show")) ?? null;
  const applications = allApplications?.filter(
    (application) => (showArchived || !application.is_archived) && (!showFilter || showFilter.match(application)),
  );

  function handleShowFilter(value: string | null) {
    setSelectedIds(new Set());
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("show", value);
        else next.delete("show");
        return next;
      },
      { replace: true },
    );
  }

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

  // The summary above the list: where the active (unarchived) applications
  // stand, and how many follow-ups are due today or earlier.
  const active = allApplications?.filter((a) => !a.is_archived) ?? [];
  const summary = LIST_FILTERS.map((filter) => ({ ...filter, count: active.filter(filter.match).length }));

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(applications?.map((a) => a.id)));
  }

  return (
    <main className="applications-page">
        {/* The page's one bold moment: title and counts on a deep-plum band. */}
        <section className="applications-page__hero">
        <div className="applications-page__header">
          <div>
            <h1>My applications</h1>
            <p className="applications-page__intro">Every posting you've saved or applied to, in one drawer.</p>
          </div>
        </div>

        {allApplications && allApplications.length > 0 && (
          <div className="applications-page__summary" role="group" aria-label="Show">
            {/* Follow-ups due leads when there are any, so it's never scrolled off on a phone. */}
            {summary
              // Zero counts are left out, except follow-ups due (always shown) and
              // the filter that's on, so it can be tapped off again.
              .filter(({ count, urgent, value }) => urgent || count > 0 || value === showFilter?.value)
              .sort((a, b) => Number(!!b.urgent && b.count > 0) - Number(!!a.urgent && a.count > 0))
              .map(({ label, count, urgent, value }) => {
                const on = value === showFilter?.value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`applications-page__stat${urgent && count > 0 ? " applications-page__stat--urgent" : ""}${on ? " applications-page__stat--on" : ""}`}
                    aria-pressed={on}
                    onClick={() => handleShowFilter(on ? null : value)}
                  >
                    <span className="applications-page__stat-count">{count}</span>
                    <span className="applications-page__stat-label">
                      {urgent ? (
                        <>
                          Follow-ups<span className="applications-page__stat-label-long"> due</span>
                        </>
                      ) : (
                        label
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        )}
        </section>

        <div className="applications-page__toolbar">
          {showArchived && <span className="applications-page__showing">Showing archived</span>}
          <SortMenu activeSorts={activeSorts} onCycleField={handleCycleSortField} />
          <ListMenu
            showArchived={showArchived}
            onShowArchivedChange={handleShowArchivedChange}
            onSelect={() => setSelecting(true)}
            onExportCsv={handleExportCsv}
            hasRows={!!applications?.length}
          />
        </div>

        {selecting && applications && (
          <BulkActionsBar
            selectedIds={selectedIds}
            applications={applications}
            allSelected={allVisibleSelected}
            onToggleSelectAll={toggleSelectAll}
            onDone={stopSelecting}
          />
        )}

        {isLoading && <p>Loading…</p>}
        {!isLoading && applications?.length === 0 && showFilter && (
          <p className="applications-page__empty">
            {showFilter.empty}{" "}
            <button type="button" className="applications-page__show-all" onClick={() => handleShowFilter(null)}>
              Show all
            </button>
          </p>
        )}
        {!isLoading && applications?.length === 0 && !showFilter && (
          <p className="applications-page__empty">
            Nothing here yet. <Link to={BOARD_PATH}>Browse postings</Link> and hit Add for evaluation on one that fits.
          </p>
        )}

        <ul className="application-list">
          {applications?.map((application, index) => (
            <li
              key={application.id}
              className={`application-row${application.job_posting.company_name ? " application-row--with-employer" : ""}`}
              style={
                {
                  "--band": listColor(index),
                  "--band-end": listColorEnd(index),
                } as CSSProperties
              }
            >
              <AutoScoreProgress application={application} />
              {selecting && (
                <input
                  type="checkbox"
                  className="application-row__select"
                  aria-label={`Select ${application.job_posting.title ?? "this application"}`}
                  checked={selectedIds.has(application.id)}
                  onChange={() => toggleSelect(application.id)}
                />
              )}
              <div className="application-row__main">
                {/* Company first, then the title — same order as the job board's cards. */}
                {/* As on the search list's cards: the logo on a white tile (with the
                    fit score at the row's far end), then the company name under it. */}
                <span className="application-row__employer">
                  <span className="application-row__tile" aria-hidden="true">
                    <CompanyLogo
                      name={application.job_posting.company_name ?? application.job_posting.title}
                      logoUrl={application.job_posting.company_logo_url}
                      size={32}
                    />
                  </span>
                  <CardScore application={application} />
                </span>
                {application.job_posting.company_name && (
                  <span className="application-row__company">{application.job_posting.company_name}</span>
                )}
                <span className="application-row__title-row">
                  <Link to={`/jobs/${application.job_posting.url_id}/apply`} className="application-row__title">
                    {application.job_posting.title ?? "Untitled role"}
                  </Link>
                  {application.is_archived && <span className="application-row__archived-badge">Archived</span>}
                </span>
                {application.job_posting.location && (
                  <span className="application-row__location">{application.job_posting.location}</span>
                )}
                <div className="application-row__meta">
                  {formatSalary(application.job_posting) && (
                    <span className="tag tag--accent application-row__pay">{formatSalary(application.job_posting)}</span>
                  )}
                  {/* One date only, the most useful one: the follow-up you set (red once
                      it's due), else when you applied, else when the job was posted. */}
                  {application.follow_up_at ? (
                    formatFollowUp(application.follow_up_at).overdue ? (
                      // Due: the date is the call to action, opening the job's notes.
                      <Link
                        to={`/jobs/${application.job_posting.url_id}/apply#notes`}
                        className="application-row__follow-up application-row__follow-up--due"
                      >
                        Follow up {formatFollowUp(application.follow_up_at).text} →
                      </Link>
                    ) : (
                      <span className="application-row__follow-up">
                        Follow up {formatFollowUp(application.follow_up_at).text}
                      </span>
                    )
                  ) : application.applied_at ? (
                    <span className="application-row__applied">Applied {formatAppliedDate(application.applied_at)}</span>
                  ) : (
                    application.job_posting.posted_at && (
                      <span className="application-row__added">
                        Posted {formatPostedDate(application.job_posting.posted_at)}
                      </span>
                    )
                  )}
                </div>
                <StepTracker application={application} />
              </div>
              <RowControls application={application} />
            </li>
          ))}
        </ul>
    </main>
  );
}
