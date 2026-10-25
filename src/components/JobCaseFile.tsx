import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_ACCESS_QUERY_KEY, ONBOARDING_QUERY_KEY, onboardingApi } from "../api/onboarding";
import { JobDescription } from "./JobDescription";
import { applicationsApi } from "../api/applications";
import { ApiError } from "../api/client";
import { trackEvent } from "../utils/analytics";
import { jobsApi } from "../api/jobs";
import { resumesApi } from "../api/resumes";
import type { AiAccess, Application, AutoScoreRun, AutoScoreStatus, JobDetail, JobPosting, Resume, User } from "../api/types";
import { highlightQuery } from "../utils/searchHighlight";
import { useSignInPrompt } from "../auth/signInPrompt";
import { AUTO_SCORE_POLL_MS, isAutoScoreActive } from "../utils/autoScore";
import { type EvaluateChoice, loadEvaluateChoice, saveEvaluateChoice } from "../utils/evaluateChoice";
import { freeEvaluationsPhrase } from "../utils/onboarding";
import { EvaluateChoiceModal, EvaluateProgressModal } from "./EvaluateChoiceModal";
import { FlagJobModal } from "./FlagJobModal";
import { ALL_SECTORS, SECTOR_SHORT_LABELS, employmentLabel, sectorLabel, workplaceLabel } from "../utils/jobTags";
import { jobAge, shortLocation, type JobAgeTone } from "../utils/jobPosting";
import { BOARD_PATH } from "../routes";
import { useAuth } from "../auth/AuthContext";
import { fitLabel, fitTier } from "../utils/fitScore";
import CompanyLogo from "./CompanyLogo";

// A JobPosting row exists from the moment its URL is submitted (see
// get_or_create_job_posting) so job_posting_id is available right away —
// scanned/not-scanned is tracked by extraction_status, not by the posting
// being present at all.
// How much of a long description the board's cards show before "Show full
// posting" (keep in step with .case-file__description--folded in JobBoardCards.css).
const DESCRIPTION_FOLD_PX = 480;

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

function postedDateLabel(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p?.posted_at) return null;
  // posted_at is a date-only string (YYYY-MM-DD) — parsing it as UTC and
  // formatting with the same zone keeps the displayed day from shifting
  // backward for anyone west of UTC.
  const date = new Date(`${p.posted_at}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatPostedAt(job: JobDetail): string | null {
  const label = postedDateLabel(job);
  return label ? `Posted ${label}` : null;
}

// first_scanned_at is a real timestamp (not a date-only string like
// posted_at), so this formats in the viewer's own local time zone — same as
// formatApplicationDate below — and includes the time of day, which
// posted_at can't (sites publish a date only). Unlike scanned_at, it never
// moves once set, so it doesn't drift forward every time the posting is
// rescanned.
function firstScannedDateLabel(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p?.first_scanned_at) return null;
  const date = new Date(p.first_scanned_at);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Closed Oct 12, 2026" in the same top-right corner (the "Found … ago" badge
// never shows on a closed job): its board stopped listing it, or a scan found
// it gone. closed_at is a real timestamp, shown in the viewer's time zone.
function closedLabel(job: JobDetail): string | null {
  if (!job.url.closed_at) return null;
  const date = new Date(job.url.closed_at);
  return `Closed ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function closedDate(job: JobDetail): string {
  return new Date(job.url.closed_at!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// The board searching for what a closed job was: its title without the
// extras employers tack on ("Seasonal Educator (3 month contract) | Brookfield
// Place" → "Seasonal Educator"), in its place unless remote, in its sector
// (or every sector, not the board's Tech default, when it has none the board
// knows, e.g. "unknown").
function similarJobsPath(posting: JobPosting): string {
  const params = new URLSearchParams();
  const title = (posting.title ?? "").split(/\s[(|–—-]\s?|,|\s\(/)[0].trim();
  if (title) params.set("q", title);
  const place = posting.location ? shortLocation(posting.location) : "";
  if (place && posting.workplace_type !== "remote" && !/remote/i.test(place)) params.set("location", place);
  params.set("sector", sectorLabel(posting.sector) ? posting.sector : ALL_SECTORS);
  return `${BOARD_PATH}?${params}`;
}

// The shared job page's band, top right (as the board's FoundBadge): the red
// "Closed Oct 12, 2026" once closed, else how new it is for a job found in
// the last 48 hours — the sunset and a pulsing dot under 24 hours, teal
// after that. Older open jobs have nothing here; their dates say it.
export function BandStatusBadge({ job }: { job: JobDetail }) {
  const closed = closedLabel(job);
  const age = jobAge(job);
  const tone = closed ? "closed" : age && age.tone !== "older" ? age.tone : null;
  if (!tone) return null;
  return (
    <span className={`board__detail-age board__detail-age--${tone}`}>
      <i aria-hidden="true" />
      {closed ?? (tone === "fresh" ? `New · Found ${age!.ago}` : `Found ${age!.ago}`)}
    </span>
  );
}

// The "Found 20m ago!" badge — see jobAge (utils/jobPosting) for the age rule
// and colors, shared with the search cards' "Posted 1d ago".
function foundBadge(job: JobDetail): { label: string; tone: JobAgeTone } | null {
  const age = jobAge(job);
  return age ? { label: `Found ${age.ago}!`, tone: age.tone } : null;
}

// The shared job page's dates, so a visitor can tell at a glance whether the
// posting is new or old: when the company posted it (a date only, posted_at
// has no time) and when we first found it, with the time in the viewer's own
// time zone. A closed job's date is its chip. Posted keeps its column even
// when the company gave no date, left blank, so First found never moves.
// Verified is when its board last listed it (or, for a job no board
// lists, when we last read it), tinted by the job's age: no words, the
// visitor reads the dates and colors for themselves. Shown to everyone,
// signed in or not.
type CheckedTone = "fresh" | "aging" | "old" | "stale" | "closed";
type DateStat = { label: string; value: string; missing?: boolean; tone?: CheckedTone };

const DAY_MS = 86_400_000;

// Green under a week, grey under 30 days, amber under 90, orange (between
// amber and red) past that; red only once closed. Age from the company's posted date (a UTC date), else when we
// found it.
function checkedTone(job: JobDetail, posting: JobPosting): CheckedTone {
  if (job.url.closed_at) return "closed";
  const since = posting.posted_at ? Date.parse(`${posting.posted_at}T00:00:00Z`) : Date.parse(posting.first_scanned_at ?? "");
  const days = Number.isNaN(since) ? 0 : (Date.now() - since) / DAY_MS;
  return days < 7 ? "fresh" : days < 30 ? "aging" : days < 90 ? "old" : "stale";
}

// "Oct 15, 2026, 4:10 PM": date and time on one line, as on the static job
// pages (which add "ET").
function dateTime(iso: string): { value: string } {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { value: `${day}, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` };
}

function dateStats(job: JobDetail, posting: JobPosting): DateStat[] {
  const posted = posting.posted_at ? postedDateLabel(job) : null;
  if (!posted && !posting.first_scanned_at) return [];
  // Many postings give no date; say so rather than leave the column blank.
  const stats: DateStat[] = [posted ? { label: "Posted", value: posted } : { label: "Posted", value: "Not listed", missing: true }];
  if (posting.first_scanned_at) stats.push({ label: "First found", ...dateTime(posting.first_scanned_at) });
  // A closed job says when it closed instead (its Closed badge's date).
  const checked = job.url.closed_at ?? job.url.last_seen_at ?? job.url.last_scanned_at;
  if (checked) stats.push({ label: job.url.closed_at ? "Closed" : "Verified", ...dateTime(checked), tone: checkedTone(job, posting) });
  return stats;
}

// Mirrors the "Job at a glance" dl on the static /job/<id> SEO pages
// (job_pages.py) — same fields, same order.
function glanceItems(job: JobDetail, posting: JobPosting): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [
    { label: "Company", value: posting.company_name ?? job.url.domain },
  ];
  if (posting.location) items.push({ label: "Location", value: posting.location });
  const pay = formatSalary(job);
  if (pay) items.push({ label: "Pay", value: pay });
  const workplace = workplaceLabel(posting.workplace_type);
  if (workplace) items.push({ label: "Workplace", value: workplace });
  const employment = employmentLabel(posting.employment_type);
  if (employment) items.push({ label: "Employment", value: employment });
  const sector = sectorLabel(posting.sector);
  if (sector) items.push({ label: "Sector", value: sector });
  const posted = postedDateLabel(job);
  if (posted) items.push({ label: "Posted", value: posted });
  const firstScanned = firstScannedDateLabel(job);
  if (firstScanned) items.push({ label: "First found", value: firstScanned });
  // closed_at is a real timestamp (date and time, viewer's time zone), like
  // first_scanned_at above. The static page has no equivalent: it's replaced
  // with a "no longer available" page once a job closes.
  if (job.url.closed_at) {
    const closed = new Date(job.url.closed_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    items.push({ label: "Closed", value: closed });
  }
  return items;
}

// created_at is a real timestamp (not a date-only string like posted_at), so
// this formats in the viewer's own local time zone rather than pinning UTC.
function formatApplicationDate(application: Application): string {
  const date = new Date(application.created_at);
  return `Added ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

// Why "Evaluate now" can't run for this job, or null if it can. Unknown
// (still loading) counts as able — the backend has the final say, and its
// error shows under the button.
function evaluateBlockedReason(
  resumes: Resume[] | undefined,
  access: AiAccess | undefined,
  jobPostingId: string,
): ReactNode | null {
  if (resumes && resumes.length === 0) {
    return (
      <>
        <Link to="/resume">Upload a resume</Link> first to evaluate jobs.
      </>
    );
  }
  if (!access || access.has_own_key || access.subscribed) return null;
  if (!access.free_trial_enabled) {
    return (
      <>
        <Link to="/api-keys">Add your own AI API key</Link> to evaluate jobs.
      </>
    );
  }
  if (access.free_trial_job_ids.includes(jobPostingId) || access.free_evaluations_remaining > 0) return null;
  return (
    <>
      You've used all {freeEvaluationsPhrase(access.free_evaluation_limit)}.{" "}
      <Link to="/api-keys">Add your own AI API key</Link> to evaluate more jobs.
    </>
  );
}

// Free-trial users: an evaluation spends one of their free ones, unless this
// job is already unlocked.
function evaluateNote(access: AiAccess | undefined, jobPostingId: string): string | null {
  if (!access || access.has_own_key || access.subscribed || !access.free_trial_enabled) return null;
  if (access.free_trial_job_ids.includes(jobPostingId)) return null;
  return `Uses 1 free evaluation (${access.free_evaluations_remaining} left).`;
}

// The Add for evaluation button's second line while an evaluation runs.
const EVALUATING_STEP: Partial<Record<AutoScoreStatus, string>> = {
  queued: "Scoring your resume",
  scoring: "Scoring your resume",
  tailoring: "Tailoring your resume",
  scoring_tailored: "Scoring the tailored resume",
};

// A finished run that scored short of ready. Every run saves the job, but
// for these the button keeps showing the score and reopens the result
// instead of turning into "View application →" (as a ready one does).
function belowReadyScore(run: AutoScoreRun | null | undefined): number | null {
  if (!run || (run.status !== "below_threshold" && run.status !== "not_ready")) return null;
  return run.best_score;
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
            <CompanyLogo name={item.posting?.company_name ?? item.url.domain} logoUrl={item.posting?.company_logo_url} size={14} />
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
  // Fetched only once the reader scrolls near it (most never get this far
  // down a posting): until then a marker sits where the section goes.
  // Vertical margin only, so the swipe board's neighboring postings, a
  // screen to either side, don't count as near.
  const markerRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const marker = markerRef.current;
    if (near || !marker) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [near]);

  const { data } = useQuery({
    queryKey: ["similar-jobs", jobId],
    queryFn: () => jobsApi.similar(jobId),
    enabled: near,
  });
  const sameCompany = data?.same_company ?? [];
  const similarTitle = data?.similar_title ?? [];
  if (!near) return <div ref={markerRef} className="case-file__similar-marker" aria-hidden="true" />;
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

// A link to the posting on the employer's own site, counted as job_site_click.
// Signed out, it goes to sign in first and comes back to the job. None for a
// closed job: the posting is gone.
export function CompanySiteLink({
  job,
  className,
  children,
}: {
  job: JobDetail;
  className: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const promptSignIn = useSignInPrompt();
  if (!(job.url.url || job.url.has_url) || job.url.closed_at) return null;
  if (!user) {
    // A page with a sign-in window (SignInPromptContext) opens it here;
    // elsewhere this goes to /login and back to the posting.
    return (
      <Link
        to={`/login?next=${encodeURIComponent(`/jobs/${job.url.id}`)}`}
        className={className}
        onClick={(e) => {
          trackEvent("job_site_sign_in", { job_id: job.url.id });
          if (promptSignIn) {
            e.preventDefault();
            promptSignIn(job);
          }
        }}
      >
        {children}
      </Link>
    );
  }
  return (
    <a
      href={job.url.url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackEvent("job_site_click", { job_id: job.url.id })}
    >
      {children}
    </a>
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
  titleHighlightQuery,
  onSelectSimilar,
  boardCards = false,
  showDates = false,
}: {
  job: JobDetail;
  user: User | null;
  isRescanning: boolean;
  rescanFailed: boolean;
  onRescan: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  // The board's current search text (only set from JobBoardPage, which has
  // one) — highlights the matched phrase in the title so it's obvious why
  // this posting is in the results. Unset everywhere else (e.g.
  // JobDetailPage's standalone deep link, which has no search context).
  titleHighlightQuery?: string;
  // See SimilarJobsList — only set from JobBoardPage.
  onSelectSimilar?: (urlId: string) => void;
  // The job board's card style: the posting's facts as chips in the header
  // (age and sector included), and in place of "Job at a glance" (which only
  // repeated them) a fit card holding the main button.
  boardCards?: boolean;
  // The shared job page's row of dates (see dateStats), under the chips.
  showDates?: boolean;
}) {
  const posting = scannedPosting(job);
  const scanFailed = job.url.scan_status === "failed";
  const queryClient = useQueryClient();
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  // Same list ApplyPage/ApplicationsPage query (same ["applications"]
  // cache key), just to answer one question here: has this posting already
  // been saved/applied to? (So "Add for evaluation" is the wrong label the
  // moment that's true.)
  const { data: applications } = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
    enabled: !!user,
  });
  const currentApplication = applications?.find((a) => a.job_posting.url_id === job.url.id) ?? null;

  // "Add for evaluation" just tracks the posting in Applications — it shouldn't
  // also navigate there. Once it exists, the label swaps to "View
  // application →", which does navigate (that's an explicit request to go
  // look at it).
  const recordApplication = useMutation({
    mutationFn: (url: string) => applicationsApi.create(url),
    onSuccess: () => {
      trackEvent("save_job", { job_id: job.url.id });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
  });

  // "Add for evaluation" asks (EvaluateChoiceModal) whether to save the job
  // for later or evaluate it now — unless a choice was saved with "Don't ask
  // again", which it then just does. Evaluating shows its progress
  // (EvaluateProgressModal) until it's done or sent to the background.
  const [evaluateChoice, setEvaluateChoice] = useState(loadEvaluateChoice);
  const [modal, setModal] = useState<"choice" | "progress" | null>(null);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const jobPostingId = posting?.id ?? "";
  const showsAddButton = !!user && !!posting && !currentApplication;

  // Same cache keys as the Resume/Apply pages, so these are usually already
  // loaded — they decide whether "Evaluate now" can run.
  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list, enabled: showsAddButton });
  const { data: aiAccess } = useQuery({
    queryKey: AI_ACCESS_QUERY_KEY,
    queryFn: onboardingApi.aiAccess,
    enabled: showsAddButton,
  });
  const blockedReason = evaluateBlockedReason(resumes, aiAccess, jobPostingId);

  // This job's latest auto-score run (null if none) — same key the apply
  // page and applications cards poll. Polled while running, so the button
  // shows its progress and, after, its score. Read even once the job is
  // saved, since a run short of ready keeps its score button.
  const autoScoreQuery = useQuery<AutoScoreRun | null>({
    queryKey: ["auto-score", jobPostingId],
    queryFn: async () => {
      try {
        return await resumesApi.getAutoScore(jobPostingId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!user && !!posting,
    retry: false,
    refetchInterval: (query) => (isAutoScoreActive(query.state.data?.status) ? AUTO_SCORE_POLL_MS : false),
  });
  const run = autoScoreQuery.data;

  const startEvaluation = useMutation({
    mutationFn: () => resumesApi.startAutoScore(jobPostingId),
    onSuccess: (started) => {
      trackEvent("evaluate_job", { job_id: job.url.id });
      setEvaluateError(null);
      queryClient.setQueryData(["auto-score", jobPostingId], started);
    },
    onError: (err) => setEvaluateError(err instanceof ApiError ? err.message : "Couldn't start the evaluation."),
  });
  const evaluating = startEvaluation.isPending || isAutoScoreActive(run?.status);

  // When a run ends, reload what it changed: the application it saved (a
  // ready one's button then becomes "View application →"), free evaluations
  // left, and onboarding's "evaluation" step.
  const lastRunStatus = useRef(run?.status);
  useEffect(() => {
    const previous = lastRunStatus.current;
    lastRunStatus.current = run?.status;
    if (isAutoScoreActive(previous) && !isAutoScoreActive(run?.status)) {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: AI_ACCESS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    }
  }, [run?.status, queryClient]);

  function runChoice(choice: EvaluateChoice) {
    if (choice === "evaluate") {
      setEvaluateError(null);
      startEvaluation.mutate();
      setModal("progress");
    } else if (job.url.url) {
      recordApplication.mutate(job.url.url);
    }
  }

  function onAddClick() {
    // Mid-run (e.g. after "Run in background") the button reopens the
    // progress; after a run that didn't add the job, its result.
    if (evaluating || belowReady !== null) setModal("progress");
    // A saved "evaluate" that can't run right now (no resume, out of free
    // evaluations) asks instead, so the reason shows.
    else if (evaluateChoice === "list" || (evaluateChoice === "evaluate" && !blockedReason)) runChoice(evaluateChoice);
    else setModal("choice");
  }

  function onChoose(choice: EvaluateChoice, remember: boolean) {
    setModal(null);
    trackEvent("evaluate_choice", {
      job_id: job.url.id,
      choice,
      remembered: remember,
      evaluate_blocked: blockedReason !== null,
    });
    if (remember) {
      saveEvaluateChoice(choice);
      setEvaluateChoice(choice);
    }
    runChoice(choice);
  }

  function forgetEvaluateChoice() {
    saveEvaluateChoice(null);
    setEvaluateChoice(null);
  }

  const belowReady = evaluating ? null : belowReadyScore(run);
  const addButtonLabel = recordApplication.isPending
    ? "Adding…"
    : evaluating
      ? "Evaluating…"
      : belowReady !== null
        ? `Scored ${belowReady} →`
        : "Check my fit →";
  const addButtonMeta = evaluating
    ? (EVALUATING_STEP[run && isAutoScoreActive(run.status) ? run.status : "queued"] ?? null)
    : belowReady !== null
      ? currentApplication?.is_archived
        ? "Archived · see why"
        : "Saved · see why"
      : run?.status === "failed"
        ? "Evaluation failed, try again"
        : null;

  // The main button: Check my fit, or View application once the job is
  // saved. In the toolbar normally; in the fit card on the board's cards.
  const addButton =
    (currentApplication && belowReady === null) || !user ? (
      <Link to={`/jobs/${job.url.id}/apply`} className="apply-button">
        <span>{currentApplication ? "View application →" : "Check my fit →"}</span>
        {currentApplication && <span className="apply-button__meta">{formatApplicationDate(currentApplication)}</span>}
      </Link>
    ) : (
      <button
        type="button"
        className="apply-button"
        disabled={recordApplication.isPending || !job.url.url}
        onClick={onAddClick}
      >
        <span>{addButtonLabel}</span>
        {addButtonMeta && <span className="apply-button__meta">{addButtonMeta}</span>}
      </button>
    );

  // The posting on the employer's own site. On the board's cards it's
  // "Apply ↗" just under the band instead (JobBoardPage, JobSwipePage,
  // JobDetailPage).
  const jobSiteLink = (job.url.url || job.url.has_url) && (
    <CompanySiteLink job={job} className="rescan-button">
      Job site ↗
    </CompanySiteLink>
  );

  // On the board's cards a long description shows its first screen, faded
  // out, with "Show full posting" under it; reopening another job folds again.
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === job.url.id;
  const [foldable, setFoldable] = useState(false);
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    setFoldable(boardCards && !!el && el.scrollHeight > DESCRIPTION_FOLD_PX + 160);
  }, [boardCards, posting?.description]);

  const fitScore = currentApplication?.best_score ?? null;
  const age = jobAge(job);

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
          {(user || job.url.url) && (
            <div className="case-file__header-actions">
              {/* A failed scan still has its source page — let people open it
                  themselves. */}
              {job.url.url && (
                <a
                  href={job.url.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rescan-button"
                  onClick={() => trackEvent("job_site_click", { job_id: job.url.id })}
                >
                  Job site ↗
                </a>
              )}
              {user && (
                <button type="button" className="rescan-button" disabled={isRescanning} onClick={onRescan}>
                  {isRescanning ? "Rescanning…" : "Rescan ↻"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {scanFailed && job.url.scan_error && <p className="rescan-error">{job.url.scan_error}</p>}
      {rescanFailed && <p className="rescan-error">Rescan failed, try again in a moment.</p>}
      {posting && !scanFailed && (
        <>
          {/* Logged out on the board's cards it would be empty (Job site and
              the main button are in the fit card): leave out its gap too. */}
          {(user || !boardCards) && (
          <div className="case-file__toolbar">
            <div className="case-file__header-left">
              {user && (
                <button type="button" className="rescan-button" disabled={isRescanning} onClick={onRescan}>
                  {isRescanning ? "Rescanning…" : "Rescan ↻"}
                </button>
              )}
            </div>
            <div className="case-file__header-actions">
              {!boardCards && jobSiteLink}
              {user && (
                <button type="button" className="rescan-button" onClick={() => setFlagModalOpen(true)}>
                  {/* "a problem" is dropped on phones so the three small buttons fit on one line. */}
                  Report<span className="case-file__label-extra"> a problem</span>
                </button>
              )}
              {!boardCards && addButton}
            </div>
          </div>
          )}
          {showsAddButton && evaluateChoice && (
            <p className="case-file__evaluate-choice">
              Check my fit always {evaluateChoice === "list" ? "adds the job to your list" : "evaluates the job now"}.{" "}
              <button type="button" onClick={forgetEvaluateChoice}>
                Ask me again
              </button>
            </p>
          )}
          {evaluateError && <p className="rescan-error case-file__evaluate-error">{evaluateError}</p>}

          <div className="case-file__header-title">
            {/* Company first, logo beside its name, then the title — same as the static job pages. */}
            <p className="case-file__employer">
              <CompanyLogo name={posting.company_name ?? job.url.domain} logoUrl={posting.company_logo_url} size={40} />
              <span>{posting.company_name ?? job.url.domain}</span>
            </p>
            <h1>{posting.title ? highlightQuery(posting.title, titleHighlightQuery) : "Untitled role"}</h1>
            {(posting.location || formatPostedAt(job)) && (
              <p className="case-file__company">
                <span>{boardCards && posting.location ? shortLocation(posting.location) : posting.location}</span>
                {formatPostedAt(job) && <span className="case-file__posted">{formatPostedAt(job)}</span>}
              </p>
            )}
          </div>

          <div className="case-file__tags">
            {workplaceLabel(posting.workplace_type) && (
              <span className={`tag tag--workplace-${posting.workplace_type}`}>{workplaceLabel(posting.workplace_type)}</span>
            )}
            {employmentLabel(posting.employment_type) && (
              <span className="tag">{employmentLabel(posting.employment_type)}</span>
            )}
            {formatSalary(job) && <span className="tag tag--accent">{formatSalary(job)}</span>}
            {boardCards && sectorLabel(posting.sector) && (
              <span className="tag tag--sector">{SECTOR_SHORT_LABELS[posting.sector] ?? sectorLabel(posting.sector)}</span>
            )}
            {/* The shared job page says Closed in its band (BandStatusBadge). */}
            {boardCards && !showDates && closedLabel(job) && <span className="tag tag--closed">{closedLabel(job)}</span>}
            {/* Only a job older than 48 hours: a newer one says so in the
                board's header band instead (JobBoardPage's FoundBadge). */}
            {boardCards && age && !showDates && age.tone === "older" && (
              <span className={`tag tag--age tag--age-${age.tone}`}>Found {age.ago}</span>
            )}
          </div>

          {showDates && dateStats(job, posting).length > 0 && (
            <dl className="case-file__dates">
              {dateStats(job, posting).map((stat) => (
                <div key={stat.label} className={stat.tone && `case-file__dates-checked case-file__dates-checked--${stat.tone}`}>
                  <dt>{stat.label}</dt>
                  <dd className={stat.missing ? "case-file__dates-missing" : undefined}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {boardCards && showDates && job.url.closed_at ? (
            // A closed job has nothing left to score or apply to: in the fit
            // card's place, the static page's closed box, pointing at what's
            // still open instead.
            <section className="case-file__fit case-file__fit--closed" aria-labelledby="case-file-fit-h">
              <div className="case-file__fit-text">
                <h2 id="case-file-fit-h">This job closed {closedDate(job)}</h2>
                <p>The employer is no longer taking applications.</p>
              </div>
              <Link
                to={similarJobsPath(posting)}
                className="apply-button"
                onClick={() => trackEvent("similar_jobs_click", { job_id: job.url.id })}
              >
                <span>Find similar open jobs →</span>
              </Link>
            </section>
          ) : boardCards ? (
            <section
              className={`case-file__fit${fitScore !== null ? ` case-file__fit--${fitTier(fitScore)}` : ""}`}
              aria-labelledby="case-file-fit-h"
            >
              {fitScore !== null ? (
                <span className={`case-file__fit-dial case-file__fit-dial--${fitTier(fitScore)}`}>{fitScore}</span>
              ) : (
                <span className="case-file__fit-dial case-file__fit-dial--unknown" aria-hidden="true">
                  ?
                </span>
              )}
              <div className="case-file__fit-text">
                <h2 id="case-file-fit-h">
                  {fitScore !== null ? `${fitLabel(fitScore).text}: ${fitScore} fit` : "What's your fit?"}
                </h2>
                <p>
                  {fitScore !== null
                    ? "Scored against your resume. Open the application for the gaps and risks."
                    : "Score your resume against this job to see your fit, the gaps and the risks."}
                </p>
              </div>
              {addButton}
            </section>
          ) : (
          <section className="case-file__glance" aria-labelledby="case-file-glance-h">
            <div className="case-file__glance-head">
              <h2 id="case-file-glance-h">Job at a glance</h2>
              {closedLabel(job) && <strong className="case-file__new case-file__new--closed">{closedLabel(job)}</strong>}
              {foundBadge(job) && (
                <strong className={`case-file__new case-file__new--${foundBadge(job)!.tone}`}>
                  {foundBadge(job)!.label}
                </strong>
              )}
            </div>
            <dl>
              {glanceItems(job, posting).map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          )}

          <div
            ref={descriptionRef}
            className={`case-file__description${foldable && !expanded ? " case-file__description--folded" : ""}`}
          >
            {posting.description ? (
              <JobDescription markdown={posting.description} />
            ) : (
              "No description was extracted for this posting."
            )}
          </div>
          {foldable && !expanded && (
            <button type="button" className="case-file__unfold" onClick={() => setExpandedFor(job.url.id)}>
              Show full posting
            </button>
          )}

          {/* Keyed by job, so opening another one waits for the reader to
              scroll down to it again. */}
          <SimilarJobsSection
            key={job.url.id}
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
      {flagModalOpen && <FlagJobModal urlId={job.url.id} onClose={() => setFlagModalOpen(false)} />}
      {modal === "choice" && (
        <EvaluateChoiceModal
          evaluateBlockedReason={blockedReason}
          evaluateNote={evaluateNote(aiAccess, jobPostingId)}
          onChoose={onChoose}
          onClose={() => {
            trackEvent("evaluate_choice", {
              job_id: job.url.id,
              choice: "close",
              remembered: false,
              evaluate_blocked: blockedReason !== null,
            });
            setModal(null);
          }}
        />
      )}
      {modal === "progress" && (
        <EvaluateProgressModal
          run={run ?? null}
          starting={startEvaluation.isPending}
          startError={evaluateError}
          applicationPath={`/jobs/${job.url.id}/apply`}
          onClose={() => setModal(null)}
        />
      )}
    </article>
  );
}
