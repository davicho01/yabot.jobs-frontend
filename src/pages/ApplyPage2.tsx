import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { JobDescription } from "../components/JobDescription";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type {
  Application,
  ApplicationStatus,
  AutoScoreRun,
  CoverLetter,
  InterviewPrep,
  ResumeScore,
  TailoredResume,
  TailoredResumeScore,
} from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import { ResumeSelect } from "../components/ResumeSelect";
import { ApplyButton } from "../components/ApplyButton";
import { StatusSelect } from "../components/StatusSelect";
import { NotesEditor } from "../components/NotesEditor";
import { TailoredDownloadMenu } from "../components/TailoredDownloadMenu";
import { CoverLetterDownloadMenu } from "../components/CoverLetterDownloadMenu";
import { PrerequisiteNotice } from "../components/PrerequisiteNotice";
import { FreeEvaluationNote } from "../components/FreeEvaluationNote";
import { AI_ACCESS_QUERY_KEY, ONBOARDING_QUERY_KEY } from "../api/onboarding";
import { fitLabel, fitTier } from "../utils/fitScore";
import {
  AUTO_SCORE_POLL_MS,
  isAutoScoreActive,
  previewAutoScoreStatus,
  previewWriting,
  useShownAutoScoreStatus,
} from "../utils/autoScore";
import { formatFollowUp } from "../utils/followUp";
import { prerequisiteMessage, genericErrorMessage } from "../utils/apiErrors";
import { scannedPosting, formatSalary, formatPostedAt, shortLocation } from "../utils/jobPosting";
import { employmentLabel, workplaceLabel } from "../utils/jobTags";
import { sliceBand } from "../utils/listGradient";
import { EvaluateButton, FitnessReportBody, StepNextButton } from "./ApplyPage";
import {
  STEP_SHORT_TITLES,
  STEP_TITLES,
  autoScoreOutcome,
  formatAppliedAt,
  processStepHeaderId,
  type StepProgressPart,
} from "./applySteps";
import "../components/JobDashboardShell.css";
import "../components/DossierAction.css";
import "./ApplyPage.css";
import "./ApplyPage2.css";
import CompanyLogo from "../components/CompanyLogo";
import { BriefcaseIcon } from "../components/PillIcons";

// /jobs/:urlId/apply (and the old trial address /apply2) — the card layout:
// the job as a banded card with its logo tile and fit pill, notes beside it,
// and each of the five steps as the same kind of card. Data, mutations and
// step logic are the same as ApplyPage's, the previous layout.

// Each step's tile icon until it's done (then ✓); the landing page's step
// tiles use the same ones. The text-style selector (\ufe0e) keeps ✂ and ✉
// from turning into color emoji on phones.
const STEP_GLYPHS: Record<number, string> = { 1: "◎", 2: "✂\ufe0e", 3: "✉\ufe0e", 4: "↗", 5: "❝" };

// How long the backend gives each auto-score stage before failing it
// (QUICK_SCORE_DEADLINE_SECONDS / TAILOR_DEADLINE_SECONDS in
// app/services/resume_llm.py): a running stage's bar fills over this long,
// so it's nearly full when the stage would time out. One that finishes
// sooner just jumps to full.
const SCORE_STAGE_SECONDS = 60;
const TAILOR_STAGE_SECONDS = 120;
// The same for writing a cover letter or interview prep
// (COVER_LETTER_DEADLINE_SECONDS / INTERVIEW_PREP_DEADLINE_SECONDS).
const WRITE_STAGE_SECONDS = 120;

// The steps' bands: the five take one slice each of the card lists' shared
// run (violet, teal, green), so they read as one continuous sweep toward the
// green "all set" card below.
const STEP_COUNT = 5;

type StepPill = { text: string; tier?: "positive" | "warning" | "negative" };

// ProcessStep's job (toggleable header over a collapsible body) as a card:
// colored band with a glyph tile and a status pill, then the title. Steps
// that are neither done nor open sit on a muted band.
function CardStep({
  index,
  title,
  status,
  pill,
  done,
  running = false,
  progress,
  isOpen,
  onToggle,
  footer,
  children,
}: {
  index: number;
  title: string;
  status: ReactNode;
  pill: StepPill;
  done: boolean;
  running?: boolean;
  progress?: StepProgressPart[];
  isOpen: boolean;
  onToggle: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = `apply2-step-body-${index}`;
  const muted = !done && !isOpen && !running;
  return (
    <li
      className={`apply2-card apply2-step${isOpen ? " apply2-step--open" : ""}${muted ? " apply2-step--muted" : ""}`}
    >
      <div
        className="apply2-band"
        style={{ "--apply2-band": sliceBand(index - 1, STEP_COUNT) } as CSSProperties}
      >
        <span className={`apply2-tile apply2-step__tile${running ? " apply2-step__tile--running" : ""}`} aria-hidden="true">
          {done ? "✓" : STEP_GLYPHS[index]}
        </span>
        <span className={`apply2-fit${pill.tier ? ` apply2-fit--${pill.tier}` : ""}`}>
          <i aria-hidden="true" />
          {pill.text}
        </span>
      </div>
      <button
        type="button"
        id={processStepHeaderId(index)}
        className="apply2-step__head"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
      >
        <span className="apply2-step__name">
          <span className="apply2-step__num">
            Step {index}
            {done ? " · Done" : ""}
          </span>
          <span className="apply2-step__title">{title}</span>
          {running && progress ? (
            <span className="process-step__progress">
              {progress.map((part) => (
                <span
                  key={part.label}
                  className={`process-step__progress-part process-step__progress-part--${part.state}`}
                  style={
                    part.seconds
                      ? ({
                          "--progress-seconds": `${part.seconds}s`,
                          "--progress-delay": `-${Math.min(part.elapsed ?? 0, part.seconds)}s`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <span className="process-step__progress-bar" />
                  <span className="process-step__progress-label">
                    {part.state === "done" ? "✓ " : ""}
                    {part.label}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="apply2-step__sub">{status}</span>
          )}
        </span>
        <span className="apply2-chev" aria-hidden="true">
          <svg viewBox="0 0 12 8" width="12" height="8" fill="none">
            <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="apply2-step__body" id={bodyId}>
          {children}
          {footer && <div className="process-step__footer">{footer}</div>}
        </div>
      )}
    </li>
  );
}

// Split so the applications list is computed here — in the part that stays
// mounted across prev/next clicks — and is only ever fetched once per
// visit, while the content below fully remounts on urlId change instead of
// reusing another job's mutation state.
export function ApplyPage2() {
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
  // For the "all done" ending: the next application after this one (wrapping
  // around) that hasn't been applied to yet — still at "saved".
  const nextUnappliedUrlId =
    activeApplications
      .slice(baseActiveIndex + 1)
      .concat(activeApplications.slice(0, baseActiveIndex))
      .find((a) => a.status === "saved" && a.job_posting.url_id !== urlId)?.job_posting.url_id ?? null;
  // "3 of 12" between Prev and Next — only when this job is one of them.
  const applicationPosition =
    currentActiveIndex === -1 ? null : { index: currentActiveIndex + 1, total: activeApplications.length };

  return (
    <ApplyPage2Content
      key={urlId}
      urlId={urlId}
      previousApplicationUrlId={previousApplicationUrlId}
      nextApplicationUrlId={nextApplicationUrlId}
      applicationPosition={applicationPosition}
      nextUnappliedUrlId={nextUnappliedUrlId}
      isJobAlreadySaved={isJobAlreadySaved}
      currentApplication={currentApplication}
    />
  );
}

function ApplyPage2Content({
  urlId,
  previousApplicationUrlId,
  nextApplicationUrlId,
  applicationPosition,
  nextUnappliedUrlId,
  isJobAlreadySaved,
  currentApplication,
}: {
  urlId: string | undefined;
  previousApplicationUrlId: string | null;
  nextApplicationUrlId: string | null;
  applicationPosition: { index: number; total: number } | null;
  nextUnappliedUrlId: string | null;
  isJobAlreadySaved: boolean;
  currentApplication: Application | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const appliedRef = useRef(false);
  // Which process step is expanded — null means all collapsed. Starts all
  // collapsed (not on step 1, which flashed open while loading even when it
  // was already done) and, once the step data below has loaded, opens the
  // first unfinished one (see the effect near the bottom of this component)
  // unless they've already clicked a step themselves.
  const [activeStep, setActiveStep] = useState<number | null>(null);
  // Same cached ["applications"] query the parent reads currentApplication
  // from (no extra request) — the step auto-select below waits on it, since
  // step 4's done-ness comes from that application's status.
  const applicationsPending = useQuery({ queryKey: ["applications"], queryFn: applicationsApi.list }).isPending;
  const hasAutoSelectedStep = useRef(false);
  const toggleStep = (step: number) => {
    hasAutoSelectedStep.current = true;
    setActiveStep((prev) => (prev === step ? null : step));
  };
  // Opens the next step and brings it into view (just below the fixed
  // header — see .process-step__header's scroll-margin-top), moving focus
  // there too so keyboard and screen-reader users land in the same place.
  const goToStep = (step: number) => {
    hasAutoSelectedStep.current = true;
    // Rendered synchronously so the step's new position (the one above it
    // just collapsed) is what gets scrolled to.
    flushSync(() => setActiveStep(step));
    const header = document.getElementById(processStepHeaderId(step));
    header?.scrollIntoView({ behavior: "smooth", block: "start" });
    header?.focus({ preventScroll: true });
  };
  // Collapsed by default — the full posting text can be long, and keeping
  // it tucked away by default matches the "keep it concise" brief.
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // The follow-up date autosaves on change (there's no Save button for
  // it, unlike Notes below) — this just gives that invisible save some
  // on-screen confirmation so it doesn't look like nothing happened.
  const [followUpStatus, setFollowUpStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Notes also start collapsed and fold back up on Save. The body is only
  // hidden (not unmounted) so an unsaved draft survives collapsing, and
  // notesJustSaved flashes "Saved ✓" in the header since Save closes the
  // editor that would otherwise show it.
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesJustSaved, setNotesJustSaved] = useState(false);
  useEffect(() => {
    if (!notesJustSaved) return;
    const timeout = window.setTimeout(() => setNotesJustSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [notesJustSaved]);
  const applicationStatus = (currentApplication?.status ?? "saved") as ApplicationStatus;
  const savedNotesText = currentApplication?.notes?.trim() ?? "";
  const followUp = currentApplication?.follow_up_at ? formatFollowUp(currentApplication.follow_up_at) : null;

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
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
  // Any AI step here can unlock this job with a free evaluation (and a score
  // ticks off the last getting-started step), so both refresh after one.
  const refreshAiAccess = () => {
    queryClient.invalidateQueries({ queryKey: AI_ACCESS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  };
  const scoreMutation = useMutation<ResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateScore(jobPostingId!, resumeIdParam),
    onSuccess: (score) => {
      setFreshScore(score);
      refreshAiAccess();
    },
    onError: refreshAiAccess,
  });
  const evaluationMutation = useMutation<ResumeScore, ApiError>({
    mutationFn: () => resumesApi.generateEvaluation(jobPostingId!, resumeIdParam),
    onSuccess: (score) => {
      setFreshScore(score);
      refreshAiAccess();
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tailored", jobPostingId, resumeIdParam] });
      refreshAiAccess();
    },
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

  // Auto score: a backend run (score → tailor → score tailored) that keeps
  // going if the candidate leaves — polled while in progress, so a refresh
  // or a return visit picks the live state back up.
  const autoScoreQuery = useQuery<AutoScoreRun, ApiError>({
    queryKey: ["auto-score", jobPostingId],
    queryFn: () => resumesApi.getAutoScore(jobPostingId!),
    enabled: !!jobPostingId && !!user,
    retry: false,
    refetchInterval: (query) => (isAutoScoreActive(query.state.data?.status) ? AUTO_SCORE_POLL_MS : false),
  });
  const autoScoreMutation = useMutation<AutoScoreRun, ApiError>({
    mutationFn: () => resumesApi.startAutoScore(jobPostingId!, resumeIdParam),
    onSuccess: (run) => queryClient.setQueryData(["auto-score", jobPostingId], run),
  });
  const autoScoreRun = autoScoreQuery.data;
  // Stepped so each step's marker/bar shows for at least a second (see
  // useShownAutoScoreStatus); everything on the page follows this, so the
  // steps fill in and the outcome line appears in step with the bars.
  const shownAutoScoreStatus = useShownAutoScoreStatus(autoScoreRun?.status);
  const autoScoreStatus = previewAutoScoreStatus() ?? shownAutoScoreStatus;
  const autoScoreActive = autoScoreMutation.isPending || isAutoScoreActive(autoScoreStatus);
  // How far into its current stage the run already was when that stage came
  // into view (0 for one that starts while watching), taken once per stage
  // so the bar's fill isn't restarted or skipped on every re-render.
  const [stageClock, setStageClock] = useState({ status: autoScoreStatus, elapsed: 0 });
  if (stageClock.status !== autoScoreStatus) {
    const sinceUpdate =
      autoScoreRun && autoScoreRun.status === autoScoreStatus
        ? (Date.now() - Date.parse(autoScoreRun.updated_at)) / 1000
        : 0;
    setStageClock({ status: autoScoreStatus, elapsed: Math.max(0, sinceUpdate) });
  }
  const stageElapsed = stageClock.elapsed;
  // Each stage the run finishes writes a score/tailored resume — reload the
  // steps' data so they fill in (dropping any older result this page made
  // itself, which would otherwise win). Which step is open is left to the
  // user — the run's progress shows on the step markers, not by opening
  // sections.
  const lastAutoScoreStatus = useRef(autoScoreStatus);
  useEffect(() => {
    const previous = lastAutoScoreStatus.current;
    lastAutoScoreStatus.current = autoScoreStatus;
    if (previous === undefined || previous === autoScoreStatus) return;
    setFreshScore(null);
    setFreshTailoredScore(null);
    tailorMutation.reset();
    queryClient.invalidateQueries({ queryKey: ["score", jobPostingId] });
    queryClient.invalidateQueries({ queryKey: ["tailored", jobPostingId] });
    queryClient.invalidateQueries({ queryKey: ["tailored-score"] });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    refreshAiAccess();
    // oxlint-disable-next-line react/exhaustive-deps -- only a status change should trigger this.
  }, [autoScoreStatus]);

  const coverLetterQuery = useQuery<CoverLetter, ApiError>({
    queryKey: ["cover-letter", jobPostingId, resumeIdParam],
    queryFn: () => resumesApi.getCoverLetter(jobPostingId!, resumeIdParam),
    enabled: !!jobPostingId,
    retry: false,
  });
  const coverLetterMutation = useMutation<CoverLetter, ApiError>({
    mutationFn: () => resumesApi.generateCoverLetter(jobPostingId!, resumeIdParam),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cover-letter", jobPostingId, resumeIdParam] });
      refreshAiAccess();
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-prep", jobPostingId, resumeIdParam] });
      refreshAiAccess();
    },
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
        score {displayedScore.overall_score}
      </span>
    </>
  ) : (
    "Not started"
  );
  // Tailoring counts as done once the new version has been scored, not
  // just generated — until then "Score this version" is the next thing to do.
  const step2Done = !!displayedTailored && !!displayedTailoredScore;
  const step2Status = !displayedTailored ? (
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
    "Tailored resume ready · score it to finish"
  );
  const step3Done = !!displayedCoverLetter;
  const step4Done = currentApplication ? currentApplication.status !== "saved" : false;
  // Applied without a cover letter: the step was passed over, not left to do.
  const step3Skipped = !step3Done && step4Done;
  const step3Status = step3Done ? "Drafted" : step3Skipped ? "Skipped" : "Not started";
  // "Applied Oct 3, 5:17 AM", or e.g. "Interviewing · applied Oct 3, 5:17 AM"
  // once the status has moved past applied — rather than repeating
  // "Status: applied · applied …".
  const appliedAtText = currentApplication?.applied_at ? formatAppliedAt(currentApplication.applied_at) : null;
  const step4Summary = !currentApplication
    ? ""
    : currentApplication.status === "applied"
      ? `Applied${appliedAtText ? ` ${appliedAtText}` : ""}`
      : `${currentApplication.status.charAt(0).toUpperCase()}${currentApplication.status.slice(1)}${
          appliedAtText ? ` · applied ${appliedAtText}` : ""
        }`;
  const step4Status = !currentApplication
    ? "Save this application to track its status"
    : step4Done
      ? step4Summary
      : "Not applied yet";
  const step5Done = !!displayedInterviewPrep;
  const step5Status = step5Done ? "Prepared" : "Optional, do this once an interview is scheduled";
  // The closing panel is about having applied, not about every optional
  // step (interview prep, which can't even start until one is scheduled)
  // being checked off — so it follows step4Done alone.
  const appliedDone = step4Done;

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
    // The tailored score is its own request, only made once a tailored
    // version exists — without waiting on it, step 2 briefly looked
    // unfinished on every load and got auto-opened. Likewise the resume
    // list (which resume the score/tailoring is for) and the applications
    // list (step 4's status).
    const stillLoading =
      applicationsPending ||
      resumesQuery.isPending ||
      scoreQuery.isPending ||
      tailoredQuery.isPending ||
      (!!displayedTailored?.id && tailoredScoreQuery.isPending) ||
      coverLetterQuery.isPending ||
      interviewPrepQuery.isPending;
    if (stillLoading) return;
    hasAutoSelectedStep.current = true;
    // A link that names a section (#step-2, #notes — the applications list's
    // "Next:" links) opens that one and scrolls to it, instead of the first
    // unfinished step.
    const target = location.hash.slice(1);
    const linkedStep = /^step-[1-5]$/.test(target) ? Number(target.slice(5)) : null;
    if (linkedStep !== null || target === "notes") {
      // oxlint-disable-next-line react/set-state-in-effect
      if (linkedStep !== null) setActiveStep(linkedStep);
      else setNotesOpen(true);
      requestAnimationFrame(() => {
        const el = document.getElementById(linkedStep !== null ? processStepHeaderId(linkedStep) : "notes-card");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (linkedStep !== null) el?.focus({ preventScroll: true });
      });
      return;
    }
    const done = [step1Done, step2Done, step3Done, step4Done, step5Done];
    const firstIncomplete = done.findIndex((d) => !d);
    // Genuinely synchronizing with four async queries (score/tailored/cover
    // letter/interview prep) settling; there's no render-time value to
    // derive this from until they resolve, and hasAutoSelectedStep keeps it
    // to a single one-shot jump rather than a render loop.
    // oxlint-disable-next-line react/set-state-in-effect
    // Everything done: leave all steps collapsed rather than opening one.
    setActiveStep(firstIncomplete === -1 ? null : firstIncomplete + 1);
  }, [
    location.hash,
    jobPostingId,
    step1Done,
    step2Done,
    step3Done,
    step4Done,
    step5Done,
    applicationsPending,
    resumesQuery.isPending,
    scoreQuery.isPending,
    tailoredQuery.isPending,
    displayedTailored?.id,
    tailoredScoreQuery.isPending,
    coverLetterQuery.isPending,
    interviewPrepQuery.isPending,
  ]);

  // Prev / position / Next through the applications list — built once and
  // shown on every version of this page (loading, not found, failed or
  // still-scanning too), so a job whose scan failed never strands you
  // without a way on to the next one.
  const navGroup = (
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
      {applicationPosition && applicationPosition.total > 1 && (
        <span className="apply__nav-position">
          {/* "2 of 74", shortened to "2/74" on phones (see CSS) so Prev /
              position / Next stay on one line. */}
          <span className="apply__nav-position-long">
            {applicationPosition.index} of {applicationPosition.total}
          </span>
          <span className="apply__nav-position-short" aria-hidden="true">
            {applicationPosition.index}/{applicationPosition.total}
          </span>
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
  );
  const stateNav = (
    <div className="apply__state-nav">
      <Link to="/applications" className="apply__back-link">
        ‹ Back to applications
      </Link>
      {navGroup}
    </div>
  );

  if (isLoading) {
    return (
      <main className="apply2 apply2--state">
        {stateNav}
        <p>Loading job-fit dashboard…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="apply2 apply2--state">
        {stateNav}
        <p>Couldn't find that posting.</p>
      </main>
    );
  }

  if (job.url.scan_status === "failed") {
    return (
      <main className="apply2 apply2--state">
        {dialog}
        {stateNav}
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
      <main className="apply2 apply2--state">
        {dialog}
        {stateNav}
        <span className="stamp stamp--neutral">Still scanning</span>
        <p>This posting hasn't finished being scanned yet. Check back shortly.</p>
        <button type="button" className="rescan-button" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh job content ↻"}
        </button>
        {isRefetchError && <p className="job-dashboard__error">Couldn't refresh this posting. Try again.</p>}
      </main>
    );
  }

  const salary = formatSalary(job);
  const companyName = posting.company_name ?? job.url.domain;
  const scoreDelta =
    bestScoreSource === "tailored" && displayedScore && bestScoreValue !== null
      ? bestScoreValue - displayedScore.overall_score
      : null;

  // The short status on each step card's band pill.
  const step1Pill: StepPill = displayedScore
    ? { text: `${displayedScore.overall_score} fit`, tier: fitTier(displayedScore.overall_score) }
    : { text: "Not started" };
  const step2Pill: StepPill = displayedTailoredScore
    ? { text: `${displayedTailoredScore.overall_score} fit`, tier: fitTier(displayedTailoredScore.overall_score) }
    : displayedTailored
      ? { text: "Score it", tier: "warning" }
      : { text: "Not started" };
  const step3Pill: StepPill = step3Done
    ? { text: "Drafted", tier: "positive" }
    : { text: step3Skipped ? "Skipped" : "Not started" };
  const step4Pill: StepPill = step4Done
    ? {
        text: `${applicationStatus.charAt(0).toUpperCase()}${applicationStatus.slice(1)}`,
        tier: "positive",
      }
    : { text: "Not applied" };
  const step5Pill: StepPill = step5Done ? { text: "Prepared", tier: "positive" } : { text: "Optional" };
  const stepDone = [step1Done, step2Done, step3Done, step4Done, step5Done];

  return (
    <main className="apply2">
      {dialog}
      <div className="apply2__toolbar">
        <Link to="/applications" className="apply2__crumb">
          <BriefcaseIcon />
          My applications
        </Link>
        {/* Only when there's another application to go to. */}
        {(previousApplicationUrlId || nextApplicationUrlId) && navGroup}
        <div className="apply2__toolbar-actions">
          <Link to={`/jobs/${job.url.id}`} className="apply2-btn apply2-btn--soft">
            View job
          </Link>
          <button
            type="button"
            className="apply2-btn apply2-btn--ink"
            onClick={() => {
              // Collapse every step so the run's progress reads from the
              // step cards; the user reopens whichever they want.
              hasAutoSelectedStep.current = true;
              setActiveStep(null);
              autoScoreMutation.mutate();
            }}
            disabled={!user || !jobPostingId || autoScoreActive}
          >
            {autoScoreActive ? (
              <>
                Scoring <span className="apply__spin" aria-hidden="true">↻</span>
              </>
            ) : bestScoreValue !== null ? (
              // Already scored: a click starts a fresh run.
              "Re-score"
            ) : (
              "Score"
            )}
          </button>
        </div>
      </div>
      {/* Only a failed score gets a line here; a finished one already shows in
          the match score card below. */}
      {autoScoreMutation.error ? (
        <p className="apply__auto-score-outcome">Score failed: {autoScoreMutation.error.message}</p>
      ) : (
        autoScoreRun?.status === "failed" &&
        !autoScoreActive && <p className="apply__auto-score-outcome">{autoScoreOutcome(autoScoreRun)!.text}</p>
      )}

      <div className="apply2__grid">
        <aside className="apply2__side">
          <article className="apply2-card apply2-job">
            {/* Always the sunset gradient, like the job card at the top of
                the page on phones; no fit pill, since the score card beside it
                shows the score. */}
            <div className="apply2-band">
              <span className="apply2-tile apply2-job__tile">
                <CompanyLogo name={companyName} logoUrl={posting.company_logo_url} size={52} />
              </span>
            </div>
            <div className="apply2-job__body">
              {/* Phones only, where the company and title above are hidden (the
                  job line at the top of the page shows them). */}
              <h2 className="apply2-job__about">About the job</h2>
              <p className="apply2-job__co">{companyName}</p>
              <h1>{posting.title ?? "Untitled role"}</h1>
              {posting.location && <p className="apply2-job__meta">{shortLocation(posting.location)}</p>}
              <div className="apply2-job__tags">
                {workplaceLabel(posting.workplace_type) && (
                  <span className="apply2-tag">{workplaceLabel(posting.workplace_type)}</span>
                )}
                {employmentLabel(posting.employment_type) && (
                  <span className="apply2-tag">{employmentLabel(posting.employment_type)}</span>
                )}
                {salary && <span className="apply2-tag apply2-tag--salary">{salary}</span>}
              </div>
              {(formatPostedAt(job) || user) && (
                <div className="apply2-job__foot">
                  {formatPostedAt(job) && <span className="apply2-job__posted">{formatPostedAt(job)}</span>}
                  {user && (
                    <button
                      type="button"
                      className="apply2-btn apply2-btn--soft apply2-btn--sm"
                      disabled={rescanMutation.isPending}
                      onClick={() => rescanMutation.mutate(job.url.id)}
                    >
                      {rescanMutation.isPending ? "Rescanning…" : "Rescan ↻"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="apply2-job__desc">
              <button
                type="button"
                className="apply2-disclose"
                onClick={() => setDescriptionOpen((open) => !open)}
                aria-expanded={descriptionOpen}
                aria-controls="description-body"
              >
                Job description
                <span className="apply2-chev" aria-hidden="true">
                  <svg viewBox="0 0 12 8" width="12" height="8" fill="none">
                    <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {descriptionOpen && (
                <div className="apply2-job__desc-body job-dashboard__description" id="description-body">
                  {posting.description ? (
                    <JobDescription markdown={posting.description} />
                  ) : (
                    "No description was extracted for this posting."
                  )}
                </div>
              )}
            </div>
          </article>

          <section className="apply2-card apply2-notes" id="notes-card">
            <button
              type="button"
              className="apply2-notes__head"
              onClick={() => setNotesOpen((open) => !open)}
              aria-expanded={notesOpen}
              aria-controls="notes-body"
            >
              <span className="apply2-notes__title">
                Notes
                {notesJustSaved && <span className="apply2-saved">Saved ✓</span>}
              </span>
              <span className="apply2-chev" aria-hidden="true">
                <svg viewBox="0 0 12 8" width="12" height="8" fill="none">
                  <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {/* Status and follow-up stay visible while collapsed, same as /apply. */}
            {!notesOpen && (
              <div className="apply-page__notes-labels">
                <StatusSelect
                  value={applicationStatus}
                  disabled={!currentApplication}
                  onChange={(status) => updateApplicationMutation.mutate({ status })}
                />
                {followUp && (
                  <span
                    className={`stamp ${
                      followUp.overdue ? "stamp--negative" : followUp.dueSoon ? "stamp--warning" : "stamp--neutral"
                    }`}
                  >
                    Follow up {followUp.text}
                  </span>
                )}
                {savedNotesText && <span className="apply-page__notes-preview">{savedNotesText}</span>}
              </div>
            )}
            <div id="notes-body" className="apply2-notes__body" hidden={!notesOpen}>
              <div className="apply2-notes__fields">
                <label className="apply2-field">
                  <span>Status</span>
                  <StatusSelect
                    value={applicationStatus}
                    disabled={!currentApplication}
                    onChange={(status) => updateApplicationMutation.mutate({ status })}
                  />
                </label>
                <label className="apply2-field">
                  <span>
                    Remind me to follow up
                    {followUpStatus === "saving" && <span className="apply2-saving"> Saving…</span>}
                    {followUpStatus === "saved" && <span className="apply2-saved">Saved ✓</span>}
                  </span>
                  <input
                    type="date"
                    className="apply2-input"
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
                </label>
              </div>
              <NotesEditor
                key={currentApplication?.id ?? "pending"}
                initialNotes={currentApplication?.notes ?? ""}
                disabled={!currentApplication}
                onSave={(notes) => {
                  updateApplicationMutation.mutate({ notes });
                  setNotesOpen(false);
                  setNotesJustSaved(true);
                }}
              />
            </div>
          </section>

          {/* Destructive actions sit apart from everything routine, as on /apply. */}
          {currentApplication && (
            <div className="apply2__remove-row">
              <button
                type="button"
                className="rescan-button delete-button"
                disabled={removeApplicationMutation.isPending}
                onClick={() => removeApplication(currentApplication.id)}
              >
                {removeApplicationMutation.isPending ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                className="rescan-button"
                disabled={updateApplicationMutation.isPending}
                onClick={() => updateApplicationMutation.mutate({ is_archived: !currentApplication.is_archived })}
              >
                {currentApplication.is_archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          )}
        </aside>

        <div className="apply2__main">
          {/* Phones only: the full job card moves below the steps there, so
              this keeps which job it is in view at the top. */}
          <div className="apply2-jobline" aria-hidden="true">
            <span className="apply2-jobline__logo">
              <CompanyLogo name={companyName} logoUrl={posting.company_logo_url} size={36} />
            </span>
            <span className="apply2-jobline__text">
              <span className="apply2-jobline__company">{companyName}</span>
              <span className="apply2-jobline__title">{posting.title ?? "Untitled role"}</span>
            </span>
          </div>
          <section className="apply2-score" aria-label="Match score">
            <div className="apply2-score__num">
              {bestScoreValue !== null ? bestScoreValue : "–"}
              {bestScoreValue !== null && <small>/100</small>}
            </div>
            <div className="apply2-score__txt">
              <span className="apply2-score__label">
                Match score
                {bestScoreSource && ` · ${bestScoreSource === "tailored" ? "Tailored resume" : "Your resume"}`}
              </span>
              <p className="apply2-score__head">
                {bestScoreValue !== null ? fitLabel(bestScoreValue).text : "Score your resume to see your fit"}
              </p>
              {scoreDelta !== null && displayedScore && (
                <span className="apply2-score__delta">
                  {displayedScore.overall_score} → {bestScoreValue} after tailoring
                </span>
              )}
            </div>
            <div className="apply2-score__meter" role="presentation">
              {bestScoreValue !== null && (
                <div className="apply2-score__fill" style={{ width: `${bestScoreValue}%` }} />
              )}
              {scoreDelta !== null && displayedScore && (
                <div className="apply2-score__was" style={{ left: `${displayedScore.overall_score}%` }} />
              )}
            </div>
          </section>

          <FreeEvaluationNote jobPostingId={jobPostingId} />

          <nav className="apply2-progress" aria-label="Steps">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                data-state={activeStep === n ? "current" : stepDone[n - 1] ? "done" : "todo"}
                style={{ "--step-band": sliceBand(n - 1, STEP_COUNT) } as CSSProperties}
                onClick={() => goToStep(n)}
              >
                <b aria-hidden="true" />
                <span>{n === 1 ? "Evaluate" : STEP_SHORT_TITLES[n]}</span>
              </button>
            ))}
          </nav>

          <ol className="apply2-steps">
            <CardStep
              index={1}
              pill={step1Pill}
              title={STEP_TITLES[1]}
              status={step1Status}
              done={step1Done}
              running={autoScoreMutation.isPending || autoScoreStatus === "queued" || autoScoreStatus === "scoring"}
              progress={[
                {
                  label: "Scoring your resume",
                  state: "current",
                  seconds: SCORE_STAGE_SECONDS,
                  elapsed: autoScoreStatus === "scoring" ? stageElapsed : 0,
                },
              ]}
              isOpen={activeStep === 1}
              onToggle={() => toggleStep(1)}
              // No footer: Next/Skip sits in the step's own action row instead
              // (beside Score this resume, or beside Re-score/Re-evaluate).
            >
              {/* Resume picker, left-aligned and enlarged — every fit check, tailored
                  version, and score on this page is computed from whichever
                  resume is selected here, so it leads the first step. */}
              <div className="apply__resume-card-picker">
                <ResumeSelect resumes={resumes} selectedId={selectedResumeId ?? ""} onChange={setPickedResumeId} />
              </div>
              {displayedScore ? (
                <section className="dossier-action apply__flush apply__fit-report">
                  <FitnessReportBody
                    score={displayedScore}
                    title="Resume evaluation"
                    description="See how your resume stacks up against this posting's requirements."
                  />
                  <div className="job-dashboard__actions job-dashboard__actions--spaced apply__action-group">
                    {displayedScore.category_scores.length === 0 && (
                      <EvaluateButton
                        label="Get full evaluation"
                        onClick={() => evaluationMutation.mutate()}
                        isPending={evaluationMutation.isPending}
                        variant="secondary"
                      />
                    )}
                    <EvaluateButton
                      label="Quick re-score"
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
                    <StepNextButton
                      nextTitle={STEP_SHORT_TITLES[2]}
                      currentDone={step1Done}
                      onClick={() => goToStep(2)}
                    />
                  </div>
                </section>
              ) : (
                <div className="job-dashboard__evaluate-panel">
                  <p>This resume hasn't been scored for this job yet.</p>
                  <div className="job-dashboard__actions apply__tailor-actions">
                    <div className="job-dashboard__actions apply__action-group">
                      <EvaluateButton
                        label="Score this resume"
                        pendingLabel="Scoring…"
                        onClick={() => scoreMutation.mutate()}
                        isPending={scoreMutation.isPending}
                        disabled={!jobPostingId}
                      />
                    </div>
                    <StepNextButton
                      nextTitle={STEP_SHORT_TITLES[2]}
                      currentDone={step1Done}
                      onClick={() => goToStep(2)}
                    />
                  </div>
                </div>
              )}
              {prerequisiteMessage(scoreError) && <PrerequisiteNotice message={prerequisiteMessage(scoreError)!} />}
              {genericErrorMessage(scoreError) && !prerequisiteMessage(scoreError) && (
                <p className="job-dashboard__error">{genericErrorMessage(scoreError)}</p>
              )}
            </CardStep>

            <CardStep
              index={2}
              pill={step2Pill}
              title={STEP_TITLES[2]}
              status={step2Status}
              done={step2Done}
              running={autoScoreStatus === "tailoring" || autoScoreStatus === "scoring_tailored"}
              progress={[
                {
                  label: "Tailoring your resume",
                  state: autoScoreStatus === "tailoring" ? "current" : "done",
                  seconds: TAILOR_STAGE_SECONDS,
                  elapsed: stageElapsed,
                },
                {
                  label: "Scoring the tailored resume",
                  state: autoScoreStatus === "scoring_tailored" ? "current" : "todo",
                  seconds: SCORE_STAGE_SECONDS,
                  elapsed: stageElapsed,
                },
              ]}
              isOpen={activeStep === 2}
              onToggle={() => toggleStep(2)}
              // No footer: Next/Skip sits in the section's own action row
              // instead (beside Tailor my resume, or beside Download).
            >
              {displayedScore &&
                displayedScore.missing_keywords.length > 0 &&
                // Stays up through tailoring itself — a tailored resume
                // existing isn't proof its gaps got addressed, only its own
                // comprehensive evaluation (category_scores filled in) is.
                !(displayedTailoredScore && displayedTailoredScore.category_scores.length > 0) && (
                <section className="dossier-action apply__flush">
                  <div className="dossier-action__header">
                    <h2>Gaps found in your evaluation</h2>
                    <p>
                      Speak to these directly in your resume below if you have relevant experience, otherwise they'll
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
                <section className="dossier-action apply__flush">
                  <div className="dossier-action__header">
                    <h2>Tailor my resume</h2>
                    <p>Generate an ATS-friendly version of your resume rewritten for this role.</p>
                  </div>
                  <div className="job-dashboard__actions apply__tailor-actions">
                    <button
                      type="button"
                      className="dossier-action__button"
                      onClick={() => tailorMutation.mutate()}
                      disabled={!jobPostingId || tailorMutation.isPending}
                    >
                      {tailorMutation.isPending ? "Tailoring…" : "Tailor my resume"}
                    </button>
                    <StepNextButton
                      nextTitle={STEP_SHORT_TITLES[3]}
                      currentDone={step2Done}
                      onClick={() => goToStep(3)}
                    />
                  </div>
                  {prerequisiteMessage(tailorMutation.error) && (
                    <PrerequisiteNotice message={prerequisiteMessage(tailorMutation.error)!} />
                  )}
                  {genericErrorMessage(tailorMutation.error) && !prerequisiteMessage(tailorMutation.error) && (
                    <p className="dossier-action__error">{genericErrorMessage(tailorMutation.error)}</p>
                  )}
                </section>
              ) : (
                <section className="dossier-action apply__flush">
                  {displayedTailoredScore ? (
                    <FitnessReportBody
                      score={displayedTailoredScore}
                      description="See how this tailored resume stacks up against this posting's requirements."
                    />
                  ) : (
                    <div className="dossier-action__header">
                      <p>Evaluate this tailored resume to see how well it matches the posting's requirements.</p>
                    </div>
                  )}
                  {/* Bottom of the card: Get full evaluation (until it's been
                      run), then Score/Re-score (plus Re-evaluate once
                      evaluated) on the left; download (with regenerate in its
                      menu) and the step's Next/Skip on the right. */}
                  <div className="job-dashboard__actions job-dashboard__actions--spaced apply__tailor-actions">
                    <div className="job-dashboard__actions apply__action-group">
                      {displayedTailoredScore && displayedTailoredScore.category_scores.length === 0 && (
                        <EvaluateButton
                          label="Get full evaluation"
                          onClick={() => tailoredEvaluationMutation.mutate()}
                          isPending={tailoredEvaluationMutation.isPending}
                          variant="secondary"
                        />
                      )}
                      <EvaluateButton
                        label={displayedTailoredScore ? "Quick re-score" : "Score this version"}
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
                    </div>
                    <div className="job-dashboard__actions apply__action-group">
                      <TailoredDownloadMenu
                        tailoredResume={displayedTailored}
                        onRegenerate={() => tailorMutation.mutate()}
                        isRegenerating={tailorMutation.isPending}
                      />
                      <StepNextButton
                        nextTitle={STEP_SHORT_TITLES[3]}
                        currentDone={step2Done}
                        onClick={() => goToStep(3)}
                      />
                    </div>
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
            </CardStep>

            <CardStep
              index={3}
              pill={step3Pill}
              title={STEP_TITLES[3]}
              status={step3Status}
              done={step3Done}
              running={coverLetterMutation.isPending || previewWriting() === "cover_letter"}
              progress={[{ label: "Writing your cover letter", state: "current", seconds: WRITE_STAGE_SECONDS }]}
              isOpen={activeStep === 3}
              onToggle={() => toggleStep(3)}
              // No footer: Next/Skip sits in the section's own action row
              // (beside Generate cover letter, or right of Download).
            >
              <section className="dossier-action apply__flush">
                {/* Instructions only until the step's done (same in steps 4–5). */}
                {!displayedCoverLetter && (
                  <p className="dossier-action__lede">Draft a cover letter that speaks directly to this posting.</p>
                )}

                {!displayedCoverLetter && (
                  <div className="job-dashboard__actions apply__tailor-actions">
                    <button
                      type="button"
                      className="dossier-action__button"
                      onClick={() => coverLetterMutation.mutate()}
                      disabled={!jobPostingId || coverLetterMutation.isPending}
                    >
                      {coverLetterMutation.isPending ? "Drafting…" : "Generate cover letter"}
                    </button>
                    <StepNextButton
                      nextTitle={STEP_SHORT_TITLES[4]}
                      currentDone={step3Done}
                      onClick={() => goToStep(4)}
                    />
                  </div>
                )}

                {displayedCoverLetter && (
                  <div className="fitness-result">
                    <p className="cover-letter-preview__greeting">{displayedCoverLetter.content.greeting}</p>
                    {displayedCoverLetter.content.body_paragraphs.slice(0, 1).map((p, i) => (
                      <p key={i} className="cover-letter-preview__paragraph">
                        {p}
                      </p>
                    ))}
                    <div className="job-dashboard__actions apply__cover-letter-actions">
                      <CoverLetterDownloadMenu
                        coverLetter={displayedCoverLetter}
                        onRegenerate={() => coverLetterMutation.mutate()}
                        isRegenerating={coverLetterMutation.isPending}
                      />
                      <StepNextButton
                        nextTitle={STEP_SHORT_TITLES[4]}
                        currentDone={step3Done}
                        onClick={() => goToStep(4)}
                      />
                    </div>
                  </div>
                )}

                {prerequisiteMessage(coverLetterMutation.error) && (
                  <PrerequisiteNotice message={prerequisiteMessage(coverLetterMutation.error)!} />
                )}
                {genericErrorMessage(coverLetterMutation.error) && !prerequisiteMessage(coverLetterMutation.error) && (
                  <p className="dossier-action__error">{genericErrorMessage(coverLetterMutation.error)}</p>
                )}
              </section>
            </CardStep>

            <CardStep
              index={4}
              pill={step4Pill}
              title={STEP_TITLES[4]}
              status={step4Status}
              done={step4Done}
              isOpen={activeStep === 4}
              onToggle={() => toggleStep(4)}
              footer={
                <StepNextButton
                  nextTitle={STEP_SHORT_TITLES[5]}
                  currentDone={step4Done}
                  onClick={() => goToStep(5)}
                />
              }
            >
              <section className="dossier-action apply__flush">
                {!step4Done && (
                  <p className="dossier-action__lede">
                    Apply → takes you to the employer's site, marks this applied and downloads your tailored resume
                    to attach.
                  </p>
                )}
                {/* Once done, the natural next thing instead of the
                    instructions (when they applied is already in the step's
                    status line right above): the follow-up reminder, or a
                    nudge to set one. */}
                {step4Done && (
                  <p className="dossier-action__lede">
                    {followUp
                      ? `Follow-up reminder set for ${followUp.text}.`
                      : "No follow-up reminder yet — set one in Notes above."}
                  </p>
                )}
                <div className="job-dashboard__actions apply__apply-actions">
                  {/* Filled while applying is the step's main action; once it's
                      marked applied it drops to the secondary blue-outlined
                      style (.rescan-button, same as View job). */}
                  {/* Same window and actions as /applications' Apply → (marks
                      it applied, downloads the tailored .docx) — the tailored
                      resume being the one this page shows for the picked
                      resume. */}
                  <ApplyButton
                    className={step4Done ? "rescan-button" : "job-dashboard__view-button apply__apply-button"}
                    target={{
                      href: job.url.url ?? "",
                      title: posting.title,
                      company: posting.company_name,
                      application: currentApplication
                        ? { id: currentApplication.id, status: currentApplication.status }
                        : null,
                      tailored: displayedTailored ?? currentApplication?.latest_tailored_resume ?? null,
                    }}
                  />
                </div>
              </section>
            </CardStep>

            <CardStep
              index={5}
              pill={step5Pill}
              title={STEP_TITLES[5]}
              status={step5Status}
              done={step5Done}
              running={interviewPrepMutation.isPending || previewWriting() === "interview_prep"}
              progress={[{ label: "Preparing your interview questions", state: "current", seconds: WRITE_STAGE_SECONDS }]}
              isOpen={activeStep === 5}
              onToggle={() => toggleStep(5)}
              footer={
                // The last step: send them on to the next job in their list,
                // or back to the list once there's nowhere else to go. Left
                // out once they've applied — the "all set" panel below
                // takes over then, rather than two buttons pointing onward.
                appliedDone ? undefined : nextApplicationUrlId ? (
                  <Link to={`/jobs/${nextApplicationUrlId}/apply`} className="process-step__next">
                    Next application →
                  </Link>
                ) : (
                  <Link to="/applications" className="process-step__next">
                    Back to applications →
                  </Link>
                )
              }
            >
              <section className="dossier-action apply__flush">
                {!displayedInterviewPrep && (
                  <p className="dossier-action__lede">
                    Likely questions for this exact role, how to answer them, and what to bring up yourself.
                  </p>
                )}

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
            </CardStep>
          </ol>
          {/* Applied: a proper ending, pointing at the next job still waiting. */}
          {appliedDone && (
            <section className="apply2-done">
              <h2>You're all set for this one</h2>
              <p>
                {step4Summary}
                {followUp ? `. Follow-up reminder set for ${followUp.text}.` : "."}{" "}
                {/* The interview line only once there is one. */}
                {currentApplication?.status === "interviewing" ? "Good luck with the interview!" : "Good luck!"}
              </p>
              {nextUnappliedUrlId ? (
                <Link to={`/jobs/${nextUnappliedUrlId}/apply`} className="apply2-btn apply2-btn--light">
                  Next job to apply for →
                </Link>
              ) : (
                <Link to="/applications" className="apply2-btn apply2-btn--light">
                  Back to applications →
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
