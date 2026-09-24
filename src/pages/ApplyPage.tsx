import { useEffect, useRef, useState, type ReactNode } from "react";
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
  InterviewPrep,
  ResumeScore,
  ScoreCategoryBreakdown,
  TailoredResume,
  TailoredResumeScore,
} from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import { ResumeSelect } from "../components/ResumeSelect";
import { StatusSelect } from "../components/StatusSelect";
import { NotesEditor } from "../components/NotesEditor";
import { TailoredDownloadMenu } from "../components/TailoredDownloadMenu";
import { PrerequisiteNotice } from "../components/PrerequisiteNotice";
import { fitLabel, fitTier } from "../utils/fitScore";
import { prerequisiteMessage, genericErrorMessage } from "../utils/apiErrors";
import { scannedPosting, formatSalary, formatPostedAt } from "../utils/jobPosting";
import { splitSentences } from "../utils/text";
import { categoryLabel } from "../utils/scoreCategories";
import "../components/JobDashboardShell.css";
import "../components/DossierAction.css";
import "./ApplyPage.css";

// Applied_at is a real timestamp (unlike the follow-up date, which is a
// day with no time-of-day), so it's worth telling apart from "Sep 23,
// 2026" — the candidate clicked Mark as applied at some specific moment,
// and step 4 says so.
function formatAppliedAt(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The real-world order a candidate works through a posting in — replaces
// the old Fit/Update Resume/Application plan/Documents/Notes tabs (which
// scattered the same handful of actions across unrelated groupings) with
// one linear process. Notes/status/archive live in their own card above
// this instead of being a "step" — they're ongoing, not a one-time task.
const STEP_COUNT = 5;

// Shared by the Fit tab (against the resume as uploaded) and the Resume
// Review tab (against the tailored version) — same score shape either way
// (ResumeScore and TailoredResumeScore both carry category_scores), just a
// different title/description around it.
function FitnessReportBody({
  score,
  title,
  description,
  onRequestEvaluation,
  isEvaluationPending,
}: {
  score: {
    overall_score: number;
    summary: string;
    matched_keywords: string[];
    missing_keywords: string[];
    category_scores: ScoreCategoryBreakdown[];
    overqualification_note: string;
  };
  title: string;
  description: string;
  // Comprehensive category breakdown is opt-in — omitted category_scores
  // means "not evaluated yet" (see app.models.resume.ResumeScore's
  // docstring), and this CTA is how the candidate requests it.
  onRequestEvaluation: () => void;
  isEvaluationPending: boolean;
}) {
  // Collapsed by default (same "keep it concise" pattern as the Job
  // description toggle above the resume picker) — keyed by category so
  // opening one doesn't affect the others, and so the Fit tab and Update
  // Resume tab (each its own FitnessReportBody instance) track state
  // independently.
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <>
      <div className="apply__report-score-badge">
        <span className={`apply__report-number apply__report-number--${fitTier(score.overall_score)}`}>
          {score.overall_score}
        </span>
        <span className={`stamp ${fitLabel(score.overall_score).stampClass}`}>{fitLabel(score.overall_score).text}</span>
      </div>
      <div className="dossier-action__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="job-dashboard__summary apply__report-text">
        {splitSentences(score.summary).map((sentence, i) => (
          <p key={i}>{sentence}</p>
        ))}
      </div>
      {score.overqualification_note && (
        // Informational only — separate from and doesn't affect
        // overall_score/category_scores, which stay purely merit-based
        // (see app.services.prompts.SCORE_PROMPT's overqualification rule).
        <div className="job-dashboard__warning" role="note">
          <span className="job-dashboard__warning-icon" aria-hidden="true">
            ⚠
          </span>
          <p>{score.overqualification_note}</p>
        </div>
      )}
      {score.category_scores.length > 0 ? (
        <div className="job-dashboard__categories">
          {score.category_scores.map((cat) => {
            const isOpen = !!openCategories[cat.category];
            const bodyId = `category-body-${cat.category}`;
            return (
              <div key={cat.category} className="job-dashboard__category">
                <button
                  type="button"
                  className="job-dashboard__category-header job-dashboard__category-toggle"
                  onClick={() => toggleCategory(cat.category)}
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                >
                  <h3>{categoryLabel(cat.category)}</h3>
                  <span className="job-dashboard__category-header-right">
                    <span className="job-dashboard__category-score">
                      {cat.score}/{cat.max_score}
                    </span>
                    <span className="job-dashboard__category-toggle-icon" aria-hidden="true">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="job-dashboard__category-body" id={bodyId}>
                    <p className="job-dashboard__category-ask">{cat.why}</p>
                    {cat.job_requirements.length > 0 && (
                      <ul className="job-dashboard__category-asks">
                        {cat.job_requirements.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    <div className="job-dashboard__category-columns">
                      <div>
                        <h4>Strengths</h4>
                        {cat.strengths.length === 0 ? (
                          <p className="job-dashboard__panel-empty">None noted.</p>
                        ) : (
                          <ul className="evidence-list evidence-list--positive">
                            {cat.strengths.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h4>Weaknesses</h4>
                        {cat.weaknesses.length === 0 ? (
                          <p className="job-dashboard__panel-empty">None noted.</p>
                        ) : (
                          <ul className="evidence-list evidence-list--negative">
                            {cat.weaknesses.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // The quick-score view: this resume/job pairing has a score but
        // hasn't been through the slower, opt-in comprehensive evaluation
        // yet (empty category_scores is exactly that signal — see
        // app.models.resume.ResumeScore's docstring) — plain matched/missing
        // keyword lists plus a CTA to request the full breakdown.
        <>
          <div className="job-dashboard__columns">
            <section className="job-dashboard__section">
              <h2>Strong evidence</h2>
              {score.matched_keywords.length === 0 ? (
                <p className="job-dashboard__panel-empty">No matched requirements were recorded.</p>
              ) : (
                <ul className="evidence-list evidence-list--positive">
                  {score.matched_keywords.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className="job-dashboard__section">
              <h2>Evidence gaps</h2>
              {score.missing_keywords.length === 0 ? (
                <p className="job-dashboard__panel-empty">No gaps were recorded.</p>
              ) : (
                <ul className="evidence-list evidence-list--negative">
                  {score.missing_keywords.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="job-dashboard__actions job-dashboard__actions--spaced">
            <EvaluateButton
              label="Get full evaluation"
              onClick={onRequestEvaluation}
              isPending={isEvaluationPending}
            />
          </div>
        </>
      )}
    </>
  );
}

function EvaluateButton({
  label,
  pendingLabel = "Evaluating…",
  onClick,
  isPending,
  disabled,
  variant = "primary",
}: {
  label: string;
  // Distinguishes "Scoring…" (fast) from "Evaluating…" (comprehensive) —
  // defaults to the latter since most callers are the comprehensive action.
  pendingLabel?: string;
  onClick: () => void;
  isPending: boolean;
  disabled?: boolean;
  // "primary" (filled accent) for the first-time call to action;
  // "secondary" (outlined, like .rescan-button elsewhere in the app) once
  // a result already exists and this just re-runs it.
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      className={variant === "secondary" ? "rescan-button" : "job-dashboard__evaluate-button"}
      onClick={onClick}
      disabled={disabled || isPending}
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}

// One numbered stop on the process timeline — a toggleable header (marker +
// title + a one-line status telling the candidate where they stand) above a
// collapsible body holding that step's actual content. Steps aren't locked
// to being done in order; any of them can be opened at any time so someone
// resuming a saved application can jump straight to whichever one they need.
function ProcessStep({
  index,
  title,
  status,
  done,
  isOpen,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  status: ReactNode;
  done: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `process-step-body-${index}`;
  return (
    <li className={`process-step${done ? " process-step--done" : ""}${isOpen ? " process-step--active" : ""}`}>
      <div className="process-step__rail" aria-hidden="true">
        <span className="process-step__marker">{done ? "✓" : index}</span>
        <span className="process-step__line" />
      </div>
      <div className="process-step__content">
        <button
          type="button"
          className="process-step__header"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
        >
          <span className="process-step__heading">
            <span className="process-step__title">{title}</span>
            <span className={`process-step__status${done ? " process-step__status--done" : ""}`}>{status}</span>
          </span>
          <span className="process-step__chevron" aria-hidden="true">
            {isOpen ? "▲" : "▼"}
          </span>
        </button>
        {isOpen && (
          <div className="process-step__body" id={bodyId}>
            {children}
          </div>
        )}
      </div>
    </li>
  );
}

// Split so the applications list is computed here — in the part that stays
// mounted across prev/next clicks — and is only ever fetched once per
// visit, while the content below fully remounts on urlId change instead of
// reusing another job's mutation state.
export function ApplyPage() {
  const { urlId } = useParams<{ urlId: string }>();
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: applicationsApi.list });
  const applications = applicationsQuery.data ?? [];
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
  // Which process step is expanded — null means all collapsed. Starts on
  // step 1 and, once the step data below has loaded, jumps once to whichever
  // step is the candidate's actual next unfinished one (see the effect near
  // the bottom of this component) unless they've already clicked a step
  // themselves.
  const [activeStep, setActiveStep] = useState<number | null>(1);
  const hasAutoSelectedStep = useRef(false);
  const toggleStep = (step: number) => {
    hasAutoSelectedStep.current = true;
    setActiveStep((prev) => (prev === step ? null : step));
  };
  // Collapsed by default — the full posting text can be long, and keeping
  // it tucked away by default matches the "keep it concise" brief.
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // The follow-up date autosaves on change (there's no Save button for
  // it, unlike Notes below) — this just gives that invisible save some
  // on-screen confirmation so it doesn't look like nothing happened.
  const [followUpStatus, setFollowUpStatus] = useState<"idle" | "saving" | "saved">("idle");

  const { data: job, isLoading, isFetching, isRefetchError, refetch } = useQuery({
    queryKey: ["job", urlId],
    queryFn: () => jobsApi.get(urlId!),
    enabled: !!urlId,
  });

  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list });
  const resumes = resumesQuery.data ?? [];
  const mainResume = resumes.find((r) => r.is_main) ?? resumes[0] ?? null;
  // pickedResumeId is an optimistic local override for this render only —
  // it's what makes the picker feel instant on click. The actual pick that
  // survives a refresh lives on the application record
  // (currentApplication.selected_resume_id, see the sync effect below,
  // near updateApplicationMutation) and is what this falls back to once
  // pickedResumeId is unset, before falling back to is_main same as before.
  const [pickedResumeId, setPickedResumeId] = useState<string | null>(null);
  const selectedResumeId = pickedResumeId ?? currentApplication?.selected_resume_id ?? mainResume?.id ?? null;
  const selectedResume = resumes.find((r) => r.id === selectedResumeId) ?? null;
  const resumeIdParam = selectedResumeId ?? undefined;

  const posting = job ? scannedPosting(job) : null;
  const jobPostingId = posting?.id;

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

  // Auto-save on visit: a job seen through this dashboard is tracked in
  // Applications too, not just scored.
  useEffect(() => {
    if (appliedRef.current) return;
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
      selected_resume_id?: string | null;
    }) => applicationsApi.update(currentApplication!.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  // Persists a resume pick to the application record so it survives a
  // refresh, instead of living only in pickedResumeId's component state —
  // the bug this fixes. Fires once per genuine pick (guarded by comparing
  // against what's already stored) rather than on every render, and stays
  // quiet afterward once the two agree — no separate "Saving…" affordance
  // like the follow-up date's below, since picking a resume already
  // re-renders the whole score/tailored/cover-letter stack beneath it.
  useEffect(() => {
    if (!currentApplication) return;
    if (pickedResumeId === null || pickedResumeId === currentApplication.selected_resume_id) return;
    updateApplicationMutation.mutate({ selected_resume_id: pickedResumeId });
    // oxlint-disable-next-line react/exhaustive-deps -- updateApplicationMutation is a fresh object every render; re-running this only on the actual inputs changing is what keeps it a one-shot sync instead of a loop.
  }, [pickedResumeId, currentApplication]);

  const scoreQuery = useQuery<ResumeScore, ApiError>({
    queryKey: ["score", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getScore(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });
  // Local "last mutation wins" cache, shared by the fast score and the
  // slower opt-in evaluation — both return the same ResumeScore shape (an
  // evaluation just fills in the row's category_scores in place), so
  // whichever ran most recently is always the right thing to show.
  const [freshScore, setFreshScore] = useState<ResumeScore | null>(null);
  const scoreMutation = useMutation<ResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateScore(jobPostingId!, resumeIdParam),
    onSuccess: setFreshScore,
  });
  const evaluationMutation = useMutation<ResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateEvaluation(jobPostingId!, resumeIdParam),
    onSuccess: setFreshScore,
  });
  const displayedScore = freshScore?.resume_id === selectedResumeId ? freshScore : scoreQuery.data;
  // scoreQuery 404s on the very first load of a job never scored yet —
  // that's already the "No fit score yet" panel below, not an error, so
  // it's excluded here (unlike a 422 missing-prerequisite, which is worth
  // surfacing immediately rather than waiting for Score to be clicked and
  // fail the same way).
  const scoreQueryError = scoreQuery.error?.status === 404 ? undefined : scoreQuery.error;
  const scoreError = scoreMutation.error ?? evaluationMutation.error ?? scoreQueryError;

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
  const displayedTailored =
    tailorMutation.data?.resume_id === selectedResumeId ? tailorMutation.data : tailoredQuery.data;

  const tailoredScoreQuery = useQuery<TailoredResumeScore, ApiError>({
    queryKey: ["tailored-score", displayedTailored?.id],
    queryFn: () => resumesApi.getTailoredScore(displayedTailored!.id),
    enabled: !!displayedTailored?.id,
    retry: false,
  });
  const [freshTailoredScore, setFreshTailoredScore] = useState<TailoredResumeScore | null>(null);
  const tailoredScoreMutation = useMutation<TailoredResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateTailoredScore(displayedTailored!.id),
    onSuccess: setFreshTailoredScore,
  });
  const tailoredEvaluationMutation = useMutation<TailoredResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateTailoredEvaluation(displayedTailored!.id),
    onSuccess: setFreshTailoredScore,
  });
  const displayedTailoredScoreRaw = freshTailoredScore ?? tailoredScoreQuery.data;
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
  const displayedCoverLetter =
    coverLetterMutation.data?.resume_id === selectedResumeId ? coverLetterMutation.data : coverLetterQuery.data;

  // resumeIdParam (now always the resolved selectedResumeId, explicit
  // main-résumé id included — see its definition above) so interview prep
  // always targets whichever résumé the score card is actually showing as
  // best, even before the candidate has touched the picker themselves.
  const interviewPrepQuery = useQuery<InterviewPrep, ApiError>({
    queryKey: ["interview-prep", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getInterviewPrep(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });
  const interviewPrepMutation = useMutation<InterviewPrep, ApiError>({
    mutationFn: () => resumesApi.generateInterviewPrep(jobPostingId!, resumeIdParam),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interview-prep", jobPostingId, resumeIdParam] }),
  });
  const displayedInterviewPrep =
    interviewPrepMutation.data?.resume_id === selectedResumeId ? interviewPrepMutation.data : interviewPrepQuery.data;

  // One headline number instead of three overlapping ones (a standalone
  // score bar plus a Fitness/Tailored pair that just repeated it) — the
  // better of the two, since that's the one that actually reflects the
  // resume version the candidate would submit.
  const bestScoreSource: "fitness" | "tailored" | null =
    displayedTailoredScore && (!displayedScore || displayedTailoredScore.overall_score > displayedScore.overall_score)
      ? "tailored"
      : displayedScore
        ? "fitness"
        : null;
  const bestScoreValue =
    bestScoreSource === "tailored"
      ? displayedTailoredScore!.overall_score
      : bestScoreSource === "fitness"
        ? displayedScore!.overall_score
        : null;

  const step1Done = !!displayedScore;
  const step1Status = displayedScore ? (
    <>
      Done ·{" "}
      <span className={`process-step__status-score process-step__status-score--${fitTier(displayedScore.overall_score)}`}>
        fit score {displayedScore.overall_score}
      </span>
    </>
  ) : (
    "Not started"
  );
  const step2Done = !!displayedTailored;
  const step2Status = !step2Done ? (
    "Not started"
  ) : displayedTailoredScore ? (
    <>
      Done ·{" "}
      <span
        className={`process-step__status-score process-step__status-score--${fitTier(displayedTailoredScore.overall_score)}`}
      >
        tailored score {displayedTailoredScore.overall_score}
      </span>
    </>
  ) : (
    "Tailored resume ready"
  );
  const step3Done = !!displayedCoverLetter;
  const step3Status = step3Done ? "Drafted" : "Not started";
  const step4Done = currentApplication ? currentApplication.status !== "saved" : false;
  const step4Status = !currentApplication
    ? "Save this application to track its status"
    : step4Done
      ? `Status: ${currentApplication.status}${
          currentApplication.applied_at ? ` · applied ${formatAppliedAt(currentApplication.applied_at)}` : ""
        }`
      : "Not applied yet";
  const step5Done = !!displayedInterviewPrep;
  const step5Status = step5Done ? "Prepared" : "Optional — do this once an interview is scheduled";

  // Jump to the candidate's actual next step once the data that decides
  // that has settled — but only the first time, and only if they haven't
  // already clicked a step themselves (toggleStep sets the ref too, so a
  // later query settling — e.g. tailoring finishes while they're reading
  // the cover letter step — never yanks them back to an earlier step).
  useEffect(() => {
    if (hasAutoSelectedStep.current) return;
    if (!jobPostingId) return;
    // isPending (not isLoading) on purpose: these queries stay disabled
    // until jobPostingId is known, and a disabled TanStack Query v5 query
    // reports isLoading: false (it isn't actively fetching) even though it
    // has never resolved — isPending is what actually means "no result
    // yet", and only flips once each query has truly settled.
    const stillLoading =
      scoreQuery.isPending || tailoredQuery.isPending || coverLetterQuery.isPending || interviewPrepQuery.isPending;
    if (stillLoading) return;
    hasAutoSelectedStep.current = true;
    const done = [step1Done, step2Done, step3Done, step4Done, step5Done];
    const firstIncomplete = done.findIndex((d) => !d);
    // Genuinely synchronizing with four async queries (score/tailored/cover
    // letter/interview prep) settling; there's no render-time value to
    // derive this from until they resolve, and hasAutoSelectedStep keeps it
    // to a single one-shot jump rather than a render loop.
    // oxlint-disable-next-line react/set-state-in-effect
    setActiveStep(firstIncomplete === -1 ? STEP_COUNT : firstIncomplete + 1);
  }, [
    jobPostingId,
    step1Done,
    step2Done,
    step3Done,
    step4Done,
    step5Done,
    scoreQuery.isPending,
    tailoredQuery.isPending,
    coverLetterQuery.isPending,
    interviewPrepQuery.isPending,
  ]);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="job-dashboard">
        <p>Loading job-fit dashboard…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="job-dashboard">
        <p>Couldn't find that posting.</p>
      </main>
    );
  }

  if (job.url.scan_status === "failed") {
    return (
      <main className="job-dashboard">
        {dialog}
        <span className="stamp stamp--neutral">Scan failed</span>
        <p>{job.url.scan_error ?? "This posting couldn't be scanned."}</p>
        <div className="job-dashboard__actions">
          {user && (
            <button
              type="button"
              className="rescan-button"
              disabled={rescanMutation.isPending}
              onClick={() => rescanMutation.mutate(job.url.id)}
            >
              {rescanMutation.isPending ? "Rescanning…" : "Rescan ↻"}
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

  if (!posting) {
    return (
      <main className="job-dashboard">
        {dialog}
        <span className="stamp stamp--neutral">Still scanning</span>
        <p>This posting hasn't finished being scanned yet — check back shortly.</p>
        <button type="button" className="rescan-button" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh job content ↻"}
        </button>
        {isRefetchError && <p className="job-dashboard__error">Couldn't refresh this posting. Try again.</p>}
      </main>
    );
  }

  const salary = formatSalary(job);

  return (
    <main className="job-dashboard">
      {dialog}
      <Link to="/applications" className="apply__back-link apply__page-back-link">
        ‹ Back to applications
      </Link>
      <div className="job-dashboard__card">
        <div className="apply__toolbar-row">
          <Link to={`/jobs/${job.url.id}`} className="rescan-button apply__toolbar-view-job">
            View job ↑
          </Link>
          <div className="apply__nav-group">
            {previousApplicationUrlId ? (
              <Link to={`/jobs/${previousApplicationUrlId}/apply`} className="apply__back-link">
                ‹ Prev
              </Link>
            ) : (
              <span className="apply__back-link apply__back-link--disabled" aria-hidden="true">
                ‹ Prev
              </span>
            )}
            {nextApplicationUrlId ? (
              <Link to={`/jobs/${nextApplicationUrlId}/apply`} className="apply__back-link">
                Next ›
              </Link>
            ) : (
              <span className="apply__back-link apply__back-link--disabled" aria-hidden="true">
                Next ›
              </span>
            )}
          </div>
          <a
            className="job-dashboard__view-button apply__apply-button apply__toolbar-apply"
            href={job.url.url ?? undefined}
            target="_blank"
            rel="noreferrer"
          >
            Apply →
          </a>
        </div>

        <div className="job-dashboard__header">
          <div className="job-dashboard__title-block">
            <h1>{posting.title ?? "Untitled role"}</h1>
            <p className="job-dashboard__subheader">
              {posting.company_name ?? job.url.domain}
              {posting.location ? ` · ${posting.location}` : ""}
            </p>
            <div className="job-dashboard__tags">
              <span className="tag">{posting.workplace_type}</span>
              <span className="tag">{posting.employment_type.replace("_", " ")}</span>
              {salary && <span className="tag tag--accent">{salary}</span>}
              {formatPostedAt(job) && <span className="apply__posted">{formatPostedAt(job)}</span>}
            </div>
          </div>
          {user && (
            <button
              type="button"
              className="rescan-button"
              disabled={rescanMutation.isPending}
              onClick={() => rescanMutation.mutate(job.url.id)}
            >
              {rescanMutation.isPending ? "Rescanning…" : "Rescan ↻"}
            </button>
          )}
        </div>

        <div className="job-dashboard__job-description">
          <button
            type="button"
            className="job-dashboard__description-toggle"
            onClick={() => setDescriptionOpen((open) => !open)}
            aria-expanded={descriptionOpen}
            aria-controls="description-body"
          >
            <span className="job-dashboard__description-toggle-title">Job description</span>
            <span className="job-dashboard__description-toggle-icon" aria-hidden="true">
              {descriptionOpen ? "▲" : "▼"}
            </span>
          </button>
          {descriptionOpen && (
            <div className="job-dashboard__description-body" id="description-body">
              <div className="job-dashboard__description">
                {posting.description ? (
                  <ReactMarkdown>{posting.description}</ReactMarkdown>
                ) : (
                  "No description was extracted for this posting."
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resume picker + a single overall score, grouped into one card —
            previously two bare unboxed rows (picker, score bar) floating
            above a second card repeating that same score alongside the
            tailored one, three numbers for what is really one "how am I
            doing" answer. Now just the better of the two (labeled so it's
            clear which resume it's for), with a live-status stamp and bar.
            The picker itself is centered and enlarged — every fit check,
            tailored version, and score on this page is computed from
            whichever resume is selected here, so it's the page's actual
            starting point, not a minor control to skim past. (An
            explanatory sentence used to sit here too, but between the
            label, the sentence, and the score row it was three separate
            pieces of text competing for attention — the size/centering
            alone already says "this one matters".) */}
        <section className="dossier-action apply__resume-card">
          <div className="dossier-action__header">
            <h2>Resume</h2>
            <p>Select the resume you'd like to use as your working resume for this application.</p>
          </div>
          <div className="apply__resume-card-picker">
            <ResumeSelect resumes={resumes} selectedId={selectedResumeId ?? ""} onChange={setPickedResumeId} />
          </div>
          <div className="apply__resume-card-divider" />
          <div className="job-dashboard__alignment">
            <div className="progress-bar" role="presentation">
              {bestScoreValue !== null && (
                <div
                  className={`progress-bar__fill progress-bar__fill--${fitTier(bestScoreValue)}`}
                  style={{ width: `${bestScoreValue}%` }}
                />
              )}
            </div>
            <span className="apply__resume-score-label">
              <span
                className={`job-dashboard__alignment-pct${bestScoreValue !== null ? ` job-dashboard__alignment-pct--${fitTier(bestScoreValue)}` : ""}`}
              >
                {bestScoreValue !== null ? `${bestScoreValue}` : "—"}
              </span>
              {bestScoreValue !== null && (
                <span className={`stamp ${fitLabel(bestScoreValue).stampClass}`}>{fitLabel(bestScoreValue).text}</span>
              )}
            </span>
          </div>
        </section>

        <section className="dossier-action">
          <div className="dossier-action__header apply-page__notes-header">
            <div>
              <h2>Notes</h2>
              <p>Keep track of anything worth remembering about this application.</p>
            </div>
            <StatusSelect
              value={(currentApplication?.status ?? "saved") as ApplicationStatus}
              disabled={!currentApplication}
              onChange={(status) => updateApplicationMutation.mutate({ status })}
            />
          </div>
          <label className="apply-page__follow-up">
            <span>Remind me to follow up</span>
            <input
              type="date"
              className="apply-page__follow-up-input"
              disabled={!currentApplication}
              value={currentApplication?.follow_up_at ?? ""}
              onChange={(e) => {
                setFollowUpStatus("saving");
                updateApplicationMutation.mutate(
                  { follow_up_at: e.target.value || null },
                  {
                    onSuccess: () => setFollowUpStatus("saved"),
                    onError: () => setFollowUpStatus("idle"),
                  },
                );
              }}
            />
            {followUpStatus === "saving" && (
              <span className="apply-page__follow-up-status">Saving…</span>
            )}
            {followUpStatus === "saved" && (
              <span className="apply-page__follow-up-status apply-page__follow-up-status--saved">Saved ✓</span>
            )}
          </label>
          {/* Archive used to live alongside Remove on their own Notes tab —
              folded in here now that the tabs are gone. Passed as
              extraActions so it sits level with Save in the same row
              instead of in its own row underneath it. Remove is
              destructive/irreversible though, so it stays on its own at
              the very bottom of the page instead of next to routine
              actions like this one. */}
          <NotesEditor
            key={currentApplication?.id ?? "pending"}
            initialNotes={currentApplication?.notes ?? ""}
            disabled={!currentApplication}
            onSave={(notes) => updateApplicationMutation.mutate({ notes })}
            extraActions={
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
            }
          />
        </section>

        <ol className="process-steps">
          <ProcessStep
            index={1}
            title="Review your skills"
            status={step1Status}
            done={step1Done}
            isOpen={activeStep === 1}
            onToggle={() => toggleStep(1)}
          >
            {displayedScore ? (
              <section className="dossier-action">
                <FitnessReportBody
                  score={displayedScore}
                  title="Fitness report"
                  description="See how your resume stacks up against this posting's requirements."
                  onRequestEvaluation={() => evaluationMutation.mutate()}
                  isEvaluationPending={evaluationMutation.isPending}
                />
                <div className="job-dashboard__actions job-dashboard__actions--spaced">
                  <EvaluateButton
                    label="Re-score"
                    pendingLabel="Scoring…"
                    onClick={() => scoreMutation.mutate()}
                    isPending={scoreMutation.isPending}
                    variant="secondary"
                  />
                  {displayedScore.category_scores.length > 0 && (
                    <EvaluateButton
                      label="Re-evaluate"
                      onClick={() => evaluationMutation.mutate()}
                      isPending={evaluationMutation.isPending}
                      variant="secondary"
                    />
                  )}
                </div>
              </section>
            ) : (
              <div className="job-dashboard__evaluate-panel">
                <p>No fit score yet for {selectedResume?.filename ?? "this resume"}.</p>
                <EvaluateButton
                  label="Score this resume"
                  pendingLabel="Scoring…"
                  onClick={() => scoreMutation.mutate()}
                  isPending={scoreMutation.isPending}
                  disabled={!jobPostingId}
                />
              </div>
            )}
            {prerequisiteMessage(scoreError) && <p className="job-dashboard__error">{prerequisiteMessage(scoreError)}</p>}
            {genericErrorMessage(scoreError) && !prerequisiteMessage(scoreError) && (
              <p className="job-dashboard__error">{genericErrorMessage(scoreError)}</p>
            )}
          </ProcessStep>

          <ProcessStep
            index={2}
            title="Address gaps & tailor your resume"
            status={step2Status}
            done={step2Done}
            isOpen={activeStep === 2}
            onToggle={() => toggleStep(2)}
          >
            {displayedScore &&
              displayedScore.missing_keywords.length > 0 &&
              // Stays up through tailoring itself — a tailored resume
              // existing isn't proof its gaps got addressed, only its own
              // comprehensive evaluation (category_scores filled in) is.
              !(displayedTailoredScore && displayedTailoredScore.category_scores.length > 0) && (
              <section className="dossier-action">
                <div className="dossier-action__header">
                  <h2>Gaps this fit check found</h2>
                  <p>
                    Speak to these directly in your resume below if you have relevant experience — otherwise they'll
                    likely come up again in the interview.
                  </p>
                </div>
                <ul className="evidence-list evidence-list--negative">
                  {displayedScore.missing_keywords.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </section>
            )}

            {!displayedTailored ? (
              <section className="dossier-action">
                <div className="dossier-action__header">
                  <h2>Tailor my resume</h2>
                  <p>Generate an ATS-friendly version of your resume rewritten for this role.</p>
                </div>
                <button
                  type="button"
                  className="dossier-action__button"
                  onClick={() => tailorMutation.mutate()}
                  disabled={!jobPostingId || tailorMutation.isPending}
                >
                  {tailorMutation.isPending ? "Tailoring…" : "Tailor my resume"}
                </button>
                {prerequisiteMessage(tailorMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(tailorMutation.error)!} />
                )}
                {genericErrorMessage(tailorMutation.error) && !prerequisiteMessage(tailorMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(tailorMutation.error)}</p>
                )}
              </section>
            ) : (
              <section className="dossier-action">
                {displayedTailoredScore ? (
                  <FitnessReportBody
                    score={displayedTailoredScore}
                    title="Fitness report for this version"
                    description="See how this tailored resume stacks up against this posting's requirements."
                    onRequestEvaluation={() => tailoredEvaluationMutation.mutate()}
                    isEvaluationPending={tailoredEvaluationMutation.isPending}
                  />
                ) : (
                  <div className="dossier-action__header">
                    <h2>Fitness report for this version</h2>
                    <p>Check this tailored resume's fit to see its report here.</p>
                  </div>
                )}
                {/* Bottom-right of the card: Score/Re-score (plus Re-evaluate
                    once evaluated) on the left, download (with regenerate in
                    its menu) on the right. */}
                <div className="job-dashboard__actions job-dashboard__actions--spaced apply__tailor-actions">
                  <EvaluateButton
                    label={displayedTailoredScore ? "Re-score" : "Score this version"}
                    pendingLabel="Scoring…"
                    onClick={() => tailoredScoreMutation.mutate()}
                    isPending={tailoredScoreMutation.isPending}
                    variant={displayedTailoredScore ? "secondary" : "primary"}
                  />
                  {displayedTailoredScore && displayedTailoredScore.category_scores.length > 0 && (
                    <EvaluateButton
                      label="Re-evaluate"
                      onClick={() => tailoredEvaluationMutation.mutate()}
                      isPending={tailoredEvaluationMutation.isPending}
                      variant="secondary"
                    />
                  )}
                  <TailoredDownloadMenu
                    tailoredResume={displayedTailored}
                    onRegenerate={() => tailorMutation.mutate()}
                    isRegenerating={tailorMutation.isPending}
                  />
                </div>
                {prerequisiteMessage(tailoredScoreMutation.error ?? tailoredEvaluationMutation.error) && (
                  <PrerequisiteNotice
                    message={prerequisiteMessage(tailoredScoreMutation.error ?? tailoredEvaluationMutation.error)!}
                  />
                )}
                {genericErrorMessage(tailoredScoreMutation.error ?? tailoredEvaluationMutation.error) &&
                  !prerequisiteMessage(tailoredScoreMutation.error ?? tailoredEvaluationMutation.error) && (
                    <p className="job-dashboard__error">
                      {genericErrorMessage(tailoredScoreMutation.error ?? tailoredEvaluationMutation.error)}
                    </p>
                  )}
                {prerequisiteMessage(tailorMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(tailorMutation.error)!} />
                )}
                {genericErrorMessage(tailorMutation.error) && !prerequisiteMessage(tailorMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(tailorMutation.error)}</p>
                )}
              </section>
            )}
          </ProcessStep>

          <ProcessStep
            index={3}
            title="Write a cover letter"
            status={step3Status}
            done={step3Done}
            isOpen={activeStep === 3}
            onToggle={() => toggleStep(3)}
          >
            <section className="dossier-action">
              <p className="dossier-action__lede">Draft a cover letter that speaks directly to this posting.</p>

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
                        await resumesApi.downloadCoverLetter(displayedCoverLetter.id, displayedCoverLetter.filename);
                      } catch {
                        setDownloadError("Couldn't download the file. Try again.");
                      }
                    }}
                  >
                    Download .docx
                  </button>
                  <button type="button" className="dossier-action__link" onClick={() => coverLetterMutation.mutate()}>
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
              {downloadError && <p className="dossier-action__error">{downloadError}</p>}
            </section>
          </ProcessStep>

          <ProcessStep
            index={4}
            title="Apply for the job"
            status={step4Status}
            done={step4Done}
            isOpen={activeStep === 4}
            onToggle={() => toggleStep(4)}
          >
            <section className="dossier-action">
              <p className="dossier-action__lede">
                Submit your application on the employer's site, then mark it applied here to keep your status in
                sync.
              </p>
              <div className="job-dashboard__actions apply__apply-actions">
                <a
                  className="job-dashboard__view-button apply__apply-button"
                  href={job.url.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Apply →
                </a>
                {currentApplication &&
                  (!step4Done ? (
                    <button
                      type="button"
                      className="rescan-button"
                      disabled={updateApplicationMutation.isPending}
                      onClick={() => updateApplicationMutation.mutate({ status: "applied" })}
                    >
                      Mark as applied
                    </button>
                  ) : (
                    <p className="job-dashboard__panel-empty">
                      Status: {currentApplication.status}
                      {currentApplication.applied_at && (
                        <> — marked applied {formatAppliedAt(currentApplication.applied_at)}</>
                      )}
                      . Change it any time from the Notes card above.
                    </p>
                  ))}
              </div>
            </section>
          </ProcessStep>

          <ProcessStep
            index={5}
            title="Prep for the interview"
            status={step5Status}
            done={step5Done}
            isOpen={activeStep === 5}
            onToggle={() => toggleStep(5)}
          >
            <section className="dossier-action">
              <p className="dossier-action__lede">
                Likely questions for this exact role, how to answer them, and what to bring up yourself.
              </p>

              {!displayedInterviewPrep && (
                <button
                  type="button"
                  className="dossier-action__button"
                  onClick={() => interviewPrepMutation.mutate()}
                  disabled={!jobPostingId || interviewPrepMutation.isPending}
                >
                  {interviewPrepMutation.isPending ? "Preparing…" : "Generate interview prep"}
                </button>
              )}

              {displayedInterviewPrep && (
                <div className="fitness-result interview-prep">
                  {displayedInterviewPrep.content.likely_questions.length > 0 && (
                    <div className="interview-prep__section">
                      <h3>Likely questions</h3>
                      <ol className="interview-prep__questions">
                        {displayedInterviewPrep.content.likely_questions.map((q, i) => (
                          <li key={i}>
                            <span className="tag interview-prep__category">{q.category.replace("_", " ")}</span>
                            <p className="interview-prep__question">{q.question}</p>
                            <p className="interview-prep__approach">{q.approach}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {displayedInterviewPrep.content.talking_points.length > 0 && (
                    <div className="interview-prep__section">
                      <h3>Bring these up yourself</h3>
                      <ul className="interview-prep__list">
                        {displayedInterviewPrep.content.talking_points.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {displayedInterviewPrep.content.questions_to_ask.length > 0 && (
                    <div className="interview-prep__section">
                      <h3>Questions to ask them</h3>
                      <ul className="interview-prep__list">
                        {displayedInterviewPrep.content.questions_to_ask.map((question, i) => (
                          <li key={i}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button type="button" className="rescan-button" onClick={() => interviewPrepMutation.mutate()}>
                    Regenerate
                  </button>
                </div>
              )}

              {prerequisiteMessage(interviewPrepMutation.error) && (
                <PrerequisiteNotice message={prerequisiteMessage(interviewPrepMutation.error)!} />
              )}
              {genericErrorMessage(interviewPrepMutation.error) && !prerequisiteMessage(interviewPrepMutation.error) && (
                <p className="dossier-action__error">{genericErrorMessage(interviewPrepMutation.error)}</p>
              )}
            </section>
          </ProcessStep>
        </ol>

      </div>

      {/* Outside the card entirely, not just at the bottom of it — Remove
          is destructive/irreversible, so it deliberately doesn't sit
          alongside any of the routine controls above, gray-card included. */}
      {currentApplication && (
        <div className="apply__remove-row">
          <button
            type="button"
            className="apply-page__archive-button delete-button"
            disabled={removeApplicationMutation.isPending}
            onClick={() => removeApplication(currentApplication.id)}
          >
            {removeApplicationMutation.isPending ? "Removing…" : "Remove application"}
          </button>
        </div>
      )}
    </main>
  );
}
