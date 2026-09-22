import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type {
  Application,
  ApplicationStatus,
  CoverLetter,
  JobDetail,
  JobPosting,
  Resume,
  ResumeScore,
  TailoredResume,
  TailoredResumeScore,
} from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import "./ApplyPage.css";

const QUALIFY_THRESHOLD = 85;
const MAYBE_THRESHOLD = 70;
const STATUSES: ApplicationStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"];

function fitLabel(score: number): { text: string; stampClass: string } {
  if (score >= QUALIFY_THRESHOLD) return { text: "Qualified", stampClass: "stamp--positive" };
  if (score >= MAYBE_THRESHOLD) return { text: "Maybe", stampClass: "stamp--warning" };
  return { text: "Not a match", stampClass: "stamp--negative" };
}

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

function prerequisiteMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status === 422) return err.message;
  return null;
}

function genericErrorMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status !== 422) return err.message;
  if (err) return "Something went wrong. Try again.";
  return null;
}

// Keyed by the caller on the application's id (see usage below) so this
// resets its local draft whenever the identity changes, instead of an
// effect syncing state after the fact.
function NotesEditor({
  initialNotes,
  disabled,
  onSave,
}: {
  initialNotes: string;
  disabled: boolean;
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  return (
    <textarea
      className="apply-page__notes-textarea"
      value={notes}
      disabled={disabled}
      placeholder="Add notes about this application…"
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => {
        if (notes !== initialNotes) onSave(notes);
      }}
    />
  );
}

// Same button-triggers-a-menu shape as TailoredDownloadMenu just below (and
// the applications list's own Download/Sort menus) — a native <select>
// looked out of place next to those, so this reads as one more of them
// instead of a form control.
function ResumePickerMenu({
  resumes,
  selectedResumeId,
  onSelect,
}: {
  resumes: Resume[];
  selectedResumeId: string | null;
  onSelect: (id: string) => void;
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

  const selected = resumes.find((r) => r.id === selectedResumeId);

  return (
    <div className="action-dropdown apply-page__resume-picker" ref={containerRef}>
      <button type="button" className="rescan-button" onClick={() => setOpen((o) => !o)}>
        {selected ? selected.filename : "Choose resume"} ↓
      </button>
      {open && (
        <div className="action-dropdown-menu">
          {resumes.map((resume) => (
            <button
              key={resume.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(resume.id);
              }}
            >
              {resume.filename}
              {resume.is_main ? " (main)" : ""}
              {resume.id === selectedResumeId ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mirrors DownloadMenu on the applications list page: the button doubles as
// the dropdown's trigger, and closing on outside-click keeps it from
// lingering open while the user works elsewhere on the page.
function TailoredDownloadMenu({
  tailoredResume,
  onRegenerate,
  isRegenerating,
}: {
  tailoredResume: TailoredResume;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      <button type="button" className="rescan-button" onClick={() => setOpen((o) => !o)}>
        Download .docx ↓
      </button>
      {open && (
        <div className="action-dropdown-menu">
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              setError(null);
              try {
                await resumesApi.downloadTailored(tailoredResume.id, tailoredResume.filename);
              } catch {
                setError("Couldn't download the file. Try again.");
              }
            }}
          >
            Download .docx
          </button>
          <button
            type="button"
            disabled={isRegenerating}
            onClick={() => {
              setOpen(false);
              onRegenerate();
            }}
          >
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      )}
      {error && <p className="dossier-action__error">{error}</p>}
    </div>
  );
}

function PrerequisiteNotice({ message }: { message: string }) {
  // The backend's 422 detail text names which prerequisite is missing (a
  // main resume vs. an LLM API key) — route to whichever settings page
  // actually fixes it, since those now live on separate pages.
  const isResumeIssue = /resume/i.test(message);
  const fixLink = isResumeIssue
    ? { to: "/resume", label: "Fix this in Resume →" }
    : { to: "/api-keys", label: "Fix this in AI API Keys →" };
  return (
    <p className="dossier-action__prereq">
      {message} <Link to={fixLink.to}>{fixLink.label}</Link>
    </p>
  );
}

export function ApplyPage() {
  const { urlId } = useParams<{ urlId: string }>();
  // Fetched here, in the wrapper that stays mounted across prev/next clicks,
  // so the saved-applications list is only ever loaded once per page visit
  // instead of refetching on every job we navigate to below.
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: applicationsApi.list });
  const applications = applicationsQuery.data ?? [];
  // Unfiltered lookup — an archived job's own /apply page still needs to
  // find its application (to show/unarchive it), even though it's excluded
  // from the prev/next cycle below.
  const currentApplication = applications.find((a) => a.job_posting.url_id === urlId) ?? null;

  const activeApplications = applications.filter((a) => !a.is_archived);
  const currentActiveIndex = activeApplications.findIndex((a) => a.job_posting.url_id === urlId);
  const canNavigateApplications = activeApplications.length > 1;
  const baseActiveIndex = currentActiveIndex === -1 ? 0 : currentActiveIndex;
  const previousApplicationUrlId = canNavigateApplications
    ? activeApplications[(baseActiveIndex - 1 + activeApplications.length) % activeApplications.length].job_posting
        .url_id
    : null;
  const nextApplicationUrlId = canNavigateApplications
    ? activeApplications[(baseActiveIndex + 1) % activeApplications.length].job_posting.url_id
    : null;
  const isJobAlreadySaved = currentApplication !== null;

  // Keyed on urlId so navigating between saved applications (which stays on
  // this same route, just with a different :urlId) fully remounts the page
  // instead of reusing mutation state / the auto-save ref from the old job.
  return (
    <ApplyPageContent
      key={urlId}
      urlId={urlId}
      previousApplicationUrlId={previousApplicationUrlId}
      nextApplicationUrlId={nextApplicationUrlId}
      isJobAlreadySaved={isJobAlreadySaved}
      currentApplication={currentApplication}
    />
  );
}

function ApplyPageContent({
  urlId,
  previousApplicationUrlId,
  nextApplicationUrlId,
  isJobAlreadySaved,
  currentApplication,
}: {
  urlId: string | undefined;
  previousApplicationUrlId: string | null;
  nextApplicationUrlId: string | null;
  isJobAlreadySaved: boolean;
  currentApplication: Application | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const appliedRef = useRef(false);

  const { data: job, isLoading, isFetching, isRefetchError, refetch } = useQuery({
    queryKey: ["job", urlId],
    queryFn: () => jobsApi.get(urlId!),
    enabled: !!urlId,
  });

  // Which uploaded resume to score/tailor/write a cover letter against —
  // defaults to the main one (undefined here means "let the backend pick
  // its own default main resume", same as before this selector existed).
  // Only meaningfully different from the default once someone has more
  // than one resume uploaded (see ResumePage) and picks a non-main one.
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list });
  const resumes = resumesQuery.data ?? [];
  const mainResume = resumes.find((r) => r.is_main) ?? null;
  const [pickedResumeId, setPickedResumeId] = useState<string | null>(null);
  const selectedResumeId = pickedResumeId ?? mainResume?.id ?? null;
  // undefined (not the main resume's own id) so a request with no picker
  // shown still hits the exact same URL/cache key it did before resume_id
  // existed.
  const resumeIdParam = pickedResumeId ?? undefined;

  const jobPostingId = job ? scannedPosting(job)?.id : undefined;

  const rescanMutation = useMutation({
    mutationFn: (id: string) => jobsApi.rescan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const removeApplicationMutation = useMutation({
    mutationFn: (id: string) => applicationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      navigate("/applications");
    },
  });

  const { confirm, dialog } = useConfirm();

  async function removeApplication(id: string) {
    if (await confirm("Remove this application? This can't be undone.")) {
      removeApplicationMutation.mutate(id);
    }
  }

  const recordApplication = useMutation({
    mutationFn: (url: string) => applicationsApi.create(url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  useEffect(() => {
    if (appliedRef.current) return;
    // Already present in the saved-applications list (fetched once by the
    // wrapper above) — skip the re-save so we don't invalidate and refetch
    // that list on every prev/next click.
    if (isJobAlreadySaved) return;
    if (job?.posting && job.url.url) {
      appliedRef.current = true;
      recordApplication.mutate(job.url.url);
    }
  }, [job, recordApplication, isJobAlreadySaved]);

  const updateApplicationMutation = useMutation({
    mutationFn: (payload: {
      status?: ApplicationStatus;
      notes?: string;
      is_archived?: boolean;
      follow_up_at?: string | null;
    }) => applicationsApi.update(currentApplication!.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const scoreQuery = useQuery<ResumeScore, ApiError>({
    queryKey: ["score", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getScore(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });

  const scoreMutation = useMutation({
    mutationFn: () => resumesApi.generateScore(jobPostingId!, resumeIdParam),
  });

  const tailoredQuery = useQuery<TailoredResume, ApiError>({
    queryKey: ["tailored", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getTailored(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });

  const tailorMutation = useMutation<TailoredResume, ApiError>({
    mutationFn: () => resumesApi.generateTailored(jobPostingId!, resumeIdParam),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tailored", jobPostingId, resumeIdParam] }),
  });

  // Same staleness concern as displayedScore/displayedCoverLetter below.
  const displayedTailored =
    tailorMutation.data?.resume_id === selectedResumeId ? tailorMutation.data : tailoredQuery.data;

  const tailoredScoreQuery = useQuery<TailoredResumeScore, ApiError>({
    queryKey: ["tailored-score", displayedTailored?.id],
    queryFn: () => resumesApi.getTailoredScore(displayedTailored!.id),
    enabled: !!displayedTailored?.id,
    retry: false,
  });

  const tailoredScoreMutation = useMutation<TailoredResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateTailoredScore(displayedTailored!.id),
  });

  const displayedTailoredScoreRaw = tailoredScoreMutation.data ?? tailoredScoreQuery.data;
  const displayedTailoredScore =
    displayedTailoredScoreRaw?.tailored_resume_id === displayedTailored?.id ? displayedTailoredScoreRaw : undefined;

  const coverLetterQuery = useQuery<CoverLetter, ApiError>({
    queryKey: ["cover-letter", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getCoverLetter(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });

  const coverLetterMutation = useMutation<CoverLetter, ApiError>({
    mutationFn: () => resumesApi.generateCoverLetter(jobPostingId!, resumeIdParam),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cover-letter", jobPostingId, resumeIdParam] }),
  });

  const [downloadError, setDownloadError] = useState<string | null>(null);

  // A mutation's own .data sticks around across query-key changes (React
  // Query doesn't know it's now stale), so switching resumes without these
  // resume_id checks would keep showing the previous resume's just-generated
  // score/tailored-resume/cover-letter instead of falling through to the
  // freshly-keyed query below.
  const displayedScore =
    scoreMutation.data?.resume_id === selectedResumeId ? scoreMutation.data : scoreQuery.data;
  const displayedCoverLetter =
    coverLetterMutation.data?.resume_id === selectedResumeId ? coverLetterMutation.data : coverLetterQuery.data;

  if (isLoading) {
    return (
      <main className="apply-page">
        <p>Loading case file…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="apply-page">
        <p>Couldn't find that posting.</p>
      </main>
    );
  }

  const posting = scannedPosting(job);
  const isRescanning = rescanMutation.isPending;

  if (job.url.scan_status === "failed") {
    return (
      <main className="apply-page">
        {dialog}
        <span className="stamp stamp--neutral">Scan failed</span>
        <p>{job.url.scan_error ?? "This posting couldn't be scanned."}</p>
        <div className="apply-page__failed-actions">
          {user && (
            <button
              type="button"
              className="rescan-button"
              disabled={isRescanning}
              onClick={() => rescanMutation.mutate(job.url.id)}
            >
              {isRescanning ? "Rescanning…" : "Rescan ↻"}
            </button>
          )}
          {user && currentApplication && (
            <button
              type="button"
              className="rescan-button delete-button"
              disabled={removeApplicationMutation.isPending}
              onClick={() => removeApplication(currentApplication.id)}
            >
              {removeApplicationMutation.isPending ? "Removing…" : "Delete ✕"}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="apply-page">
      {dialog}
      <div className="apply-page__layout">
          <div className="apply-page__description-col">
            <div className="apply-page__description-header">
              {user && (
                <button
                  type="button"
                  className="rescan-button"
                  disabled={isRescanning}
                  onClick={() => rescanMutation.mutate(job.url.id)}
                >
                  {isRescanning ? "Rescanning…" : "Rescan ↻"}
                </button>
              )}
              <div className="apply-page__job-nav">
                {previousApplicationUrlId ? (
                  <Link to={`/jobs/${previousApplicationUrlId}/apply`} className="apply-page__nav-button">
                    ‹ Prev
                  </Link>
                ) : (
                  <span className="apply-page__nav-button apply-page__nav-button--disabled" aria-hidden="true">
                    ‹ Prev
                  </span>
                )}
                {nextApplicationUrlId ? (
                  <Link to={`/jobs/${nextApplicationUrlId}/apply`} className="apply-page__nav-button">
                    Next ›
                  </Link>
                ) : (
                  <span className="apply-page__nav-button apply-page__nav-button--disabled" aria-hidden="true">
                    Next ›
                  </span>
                )}
              </div>
              <Link to={`/jobs/${job.url.id}`} className="rescan-button apply-page__view-link">
                View ↑
              </Link>
            </div>

            {!posting ? (
              <div className="apply-page__description" aria-live="polite">
                <span className="stamp stamp--neutral">Still scanning</span>
                <p>This posting hasn't finished being scanned yet — check back shortly.</p>
                <button
                  type="button"
                  className="rescan-button"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                >
                  {isFetching ? "Refreshing…" : "Refresh job content ↻"}
                </button>
                {isRefetchError && (
                  <p className="dossier-action__error">Couldn't refresh this posting. Try again.</p>
                )}
              </div>
            ) : (
              <>
                <div className="apply-page__title-block">
                  <h1>{posting.title ?? "Untitled role"}</h1>
                  <p className="apply-page__company">
                    <span>
                      {posting.company_name ?? job.url.domain}
                      {posting.location ? ` · ${posting.location}` : ""}
                    </span>
                    {formatPostedAt(job) && <span className="apply-page__posted">{formatPostedAt(job)}</span>}
                  </p>
                </div>

                <div className="apply-page__tags">
                  <span className="tag">{posting.workplace_type}</span>
                  <span className="tag">{posting.employment_type.replace("_", " ")}</span>
                  {formatSalary(job) && <span className="tag tag--accent">{formatSalary(job)}</span>}
                </div>

                <div className="apply-page__description">
                  {posting.description ? (
                    <ReactMarkdown>{posting.description}</ReactMarkdown>
                  ) : (
                    "No description was extracted for this posting."
                  )}
                </div>
              </>
            )}
          </div>

          <div className="apply-page__main-col">
            <div className="apply-page__main-header">
              <Link to="/applications" className="apply-page__view-applications-button">
                View all applications
              </Link>
              <a href={job.url.url} target="_blank" rel="noreferrer" className="apply-page__apply-button">
                Apply →
              </a>
            </div>
            <div className="dossier">
              <section className="dossier-action">
                <div className="score-summary-row">
                  <div className="score-summary-item">
                    {displayedScore && (
                      <span
                        className={`stamp score-summary-item__stamp ${fitLabel(displayedScore.overall_score).stampClass}`}
                      >
                        {fitLabel(displayedScore.overall_score).text}
                      </span>
                    )}
                    <span className="keyword-row__label score-summary-item__label">Fitness score</span>
                    <span className="fitness-result__number">{displayedScore?.overall_score ?? "—"}</span>
                  </div>
                  <div className="score-summary-divider" />
                  <div className="score-summary-item">
                    {displayedTailoredScore && (
                      <span
                        className={`stamp score-summary-item__stamp ${fitLabel(displayedTailoredScore.overall_score).stampClass}`}
                      >
                        {fitLabel(displayedTailoredScore.overall_score).text}
                      </span>
                    )}
                    <span className="keyword-row__label score-summary-item__label">Tailored score</span>
                    <span className="fitness-result__number">{displayedTailoredScore?.overall_score ?? "—"}</span>
                  </div>
                </div>
              </section>

              <section className="dossier-action">
                <div className="dossier-action__header apply-page__notes-header">
                  <div>
                    <h2>Notes</h2>
                    <p>Keep track of anything worth remembering about this application.</p>
                  </div>
                  <select
                    className="apply-page__status-select"
                    value={currentApplication?.status ?? "saved"}
                    disabled={!currentApplication}
                    onChange={(e) =>
                      updateApplicationMutation.mutate({ status: e.target.value as ApplicationStatus })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="apply-page__follow-up">
                  <span>Remind me to follow up</span>
                  <input
                    type="date"
                    className="apply-page__follow-up-input"
                    disabled={!currentApplication}
                    value={currentApplication?.follow_up_at ?? ""}
                    onChange={(e) =>
                      updateApplicationMutation.mutate({ follow_up_at: e.target.value || null })
                    }
                  />
                </label>
                <NotesEditor
                  key={currentApplication?.id ?? "pending"}
                  initialNotes={currentApplication?.notes ?? ""}
                  disabled={!currentApplication}
                  onSave={(notes) => updateApplicationMutation.mutate({ notes })}
                />
              </section>

              <section className="dossier-action">
                {displayedScore && (
                  <span className={`stamp dossier-action__corner-stamp ${fitLabel(displayedScore.overall_score).stampClass}`}>
                    {fitLabel(displayedScore.overall_score).text}
                  </span>
                )}
                <div className="dossier-action__header">
                  <h2>Fitness report</h2>
                  <p>See how your resume stacks up against this posting's requirements.</p>
                </div>

                {!displayedScore && (
                  <button
                    type="button"
                    className="dossier-action__button"
                    onClick={() => scoreMutation.mutate()}
                    disabled={!jobPostingId || scoreMutation.isPending}
                  >
                    {scoreMutation.isPending ? "Evaluating…" : "Check if I qualify"}
                  </button>
                )}

                {displayedScore && (
                  <div className="fitness-result">
                    <div className="fitness-result__summary">
                      <span className="fitness-result_section_number">{displayedScore.overall_score}</span>
                      <p>{displayedScore.summary}</p>
                    </div>
                    {displayedScore.matched_keywords.length > 0 && (
                      <div className="keyword-row">
                        <span className="keyword-row__label">Matched</span>
                        {displayedScore.matched_keywords.map((k) => (
                          <span key={k} className="tag tag--accent">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {displayedScore.missing_keywords.length > 0 && (
                      <div className="keyword-row">
                        <span className="keyword-row__label">Missing</span>
                        {displayedScore.missing_keywords.map((k) => (
                          <span key={k} className="tag tag--secondary">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    <button type="button" className="rescan-button" onClick={() => scoreMutation.mutate()}>
                      Re-evaluate
                    </button>
                  </div>
                )}

                {prerequisiteMessage(scoreMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(scoreMutation.error)!} />
                )}
                {genericErrorMessage(scoreMutation.error) && !prerequisiteMessage(scoreMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(scoreMutation.error)}</p>
                )}

                {resumes.length > 1 && (
                  <ResumePickerMenu
                    resumes={resumes}
                    selectedResumeId={selectedResumeId}
                    onSelect={setPickedResumeId}
                  />
                )}
              </section>

              <section className="dossier-action">
                {displayedTailoredScore && (
                  <span
                    className={`stamp dossier-action__corner-stamp ${fitLabel(displayedTailoredScore.overall_score).stampClass}`}
                  >
                    {fitLabel(displayedTailoredScore.overall_score).text}
                  </span>
                )}
                {!displayedTailored && (
                  <div className="dossier-action__header">
                    <h2>Tailor my resume</h2>
                    <p>Generate an ATS-friendly version of your resume rewritten for this role.</p>
                  </div>
                )}

                {!displayedTailored && (
                  <button
                    type="button"
                    className="dossier-action__button"
                    onClick={() => tailorMutation.mutate()}
                    disabled={!jobPostingId || tailorMutation.isPending}
                  >
                    {tailorMutation.isPending ? "Tailoring…" : "Tailor my resume"}
                  </button>
                )}

                {displayedTailored && (
                  <div className="fitness-result">
                    <div className="dossier-action__header">
                      <h2>Fitness report for this version</h2>
                      <p>See how this tailored resume stacks up against this posting's requirements.</p>
                    </div>

                    {displayedTailoredScore && (
                      <div className="fitness-result">
                        <div className="fitness-result__summary">
                          <span className="fitness-result_section_number">{displayedTailoredScore.overall_score}</span>
                          <p>{displayedTailoredScore.summary}</p>
                        </div>
                        {displayedTailoredScore.matched_keywords.length > 0 && (
                          <div className="keyword-row">
                            <span className="keyword-row__label">Matched</span>
                            {displayedTailoredScore.matched_keywords.map((k) => (
                              <span key={k} className="tag tag--accent">
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                        {displayedTailoredScore.missing_keywords.length > 0 && (
                          <div className="keyword-row">
                            <span className="keyword-row__label">Missing</span>
                            {displayedTailoredScore.missing_keywords.map((k) => (
                              <span key={k} className="tag tag--secondary">
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {prerequisiteMessage(tailoredScoreMutation.error) && (
                      <PrerequisiteNotice message={prerequisiteMessage(tailoredScoreMutation.error)!} />
                    )}
                    {genericErrorMessage(tailoredScoreMutation.error) &&
                      !prerequisiteMessage(tailoredScoreMutation.error) && (
                        <p className="dossier-action__error">{genericErrorMessage(tailoredScoreMutation.error)}</p>
                      )}

                    <div className="dossier-action__action-row">
                      <button
                        type="button"
                        className={displayedTailoredScore ? "rescan-button" : "dossier-action__button"}
                        onClick={() => tailoredScoreMutation.mutate()}
                        disabled={tailoredScoreMutation.isPending}
                      >
                        {tailoredScoreMutation.isPending
                          ? "Evaluating…"
                          : displayedTailoredScore
                            ? "Re-check tailored fit"
                            : "Check tailored fit"}
                      </button>
                      <TailoredDownloadMenu
                        tailoredResume={displayedTailored}
                        onRegenerate={() => tailorMutation.mutate()}
                        isRegenerating={tailorMutation.isPending}
                      />
                    </div>
                  </div>
                )}

                {prerequisiteMessage(tailorMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(tailorMutation.error)!} />
                )}
                {genericErrorMessage(tailorMutation.error) && !prerequisiteMessage(tailorMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(tailorMutation.error)}</p>
                )}
              </section>

              <section className="dossier-action">
                <div className="dossier-action__header">
                  <h2>Write a cover letter</h2>
                  <p>Draft a cover letter that speaks directly to this posting.</p>
                </div>

                {!displayedCoverLetter && (
                  <button
                    type="button"
                    className="dossier-action__button"
                    onClick={() => coverLetterMutation.mutate()}
                    disabled={!jobPostingId || coverLetterMutation.isPending}
                  >
                    {coverLetterMutation.isPending ? "Drafting…" : "Generate cover letter"}
                  </button>
                )}

                {displayedCoverLetter && (
                  <div className="fitness-result">
                    <p className="cover-letter-preview__greeting">{displayedCoverLetter.content.greeting}</p>
                    {displayedCoverLetter.content.body_paragraphs.slice(0, 1).map((p, i) => (
                      <p key={i} className="cover-letter-preview__paragraph">
                        {p}
                      </p>
                    ))}
                    <button
                      type="button"
                      className="dossier-action__button"
                      onClick={async () => {
                        setDownloadError(null);
                        try {
                          await resumesApi.downloadCoverLetter(
                            displayedCoverLetter.id,
                            displayedCoverLetter.filename,
                          );
                        } catch {
                          setDownloadError("Couldn't download the file. Try again.");
                        }
                      }}
                    >
                      Download .docx
                    </button>
                    <button
                      type="button"
                      className="dossier-action__link"
                      onClick={() => coverLetterMutation.mutate()}
                    >
                      Regenerate
                    </button>
                  </div>
                )}

                {prerequisiteMessage(coverLetterMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(coverLetterMutation.error)!} />
                )}
                {genericErrorMessage(coverLetterMutation.error) && !prerequisiteMessage(coverLetterMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(coverLetterMutation.error)}</p>
                )}
              </section>

              <div className="apply-page__archive-row">
                <button
                  type="button"
                  className="apply-page__archive-button"
                  disabled={!currentApplication || updateApplicationMutation.isPending}
                  onClick={() =>
                    currentApplication &&
                    updateApplicationMutation.mutate({ is_archived: !currentApplication.is_archived })
                  }
                >
                  {currentApplication?.is_archived ? "Unarchive application" : "Archive application"}
                </button>
                {currentApplication && (
                  <button
                    type="button"
                    className="apply-page__archive-button delete-button"
                    disabled={removeApplicationMutation.isPending}
                    onClick={() => removeApplication(currentApplication.id)}
                  >
                    {removeApplicationMutation.isPending ? "Removing…" : "Remove application"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      {downloadError && <p className="dossier-action__error">{downloadError}</p>}
    </main>
  );
}
