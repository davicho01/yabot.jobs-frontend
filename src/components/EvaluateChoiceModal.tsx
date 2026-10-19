import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AutoScoreRun, AutoScoreStatus } from "../api/types";
import { isAutoScoreActive, useShownAutoScoreStatus } from "../utils/autoScore";
import type { EvaluateChoice } from "../utils/evaluateChoice";
import { fitTier } from "../utils/fitScore";
import "./EvaluateChoiceModal.css";
import { BriefcaseIcon, ListIcon } from "./PillIcons";

// Asked when "Add for evaluation" is clicked (unless a choice was saved with
// "Don't ask again" — see utils/evaluateChoice): save the job to evaluate
// later, or run the auto score now (backend: app.services.auto_score —
// below 75 it stops, otherwise it tailors and re-scores, and at 85+ it adds
// the application marked ready to apply). Each option acts on click.
export function EvaluateChoiceModal({
  evaluateBlockedReason,
  evaluateNote,
  onChoose,
  onClose,
}: {
  // Why "Evaluate now" can't run (no resume, no AI access left) — the
  // option is disabled and this shown just below it (outside the button, so
  // it can link to where to fix it). Null when it can run.
  evaluateBlockedReason: ReactNode | null;
  // Extra line under "Evaluate now", e.g. that it uses a free evaluation.
  evaluateNote: string | null;
  onChoose: (choice: EvaluateChoice, remember: boolean) => void;
  onClose: () => void;
}) {
  const [remember, setRemember] = useState(false);

  return (
    <div className="evaluate-choice-modal__overlay" onClick={onClose}>
      <div
        className="evaluate-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add this job for evaluation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="evaluate-choice-modal__header">
          <h2>Add for evaluation</h2>
          <button type="button" className="evaluate-choice-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <button type="button" className="evaluate-choice-modal__option" onClick={() => onChoose("list", remember)}>
          <span className="evaluate-choice-modal__option-title">Add to my list</span>
          <span className="evaluate-choice-modal__option-body">Evaluate it later from My applications.</span>
        </button>

        <button
          type="button"
          className="evaluate-choice-modal__option"
          disabled={evaluateBlockedReason !== null}
          onClick={() => onChoose("evaluate", remember)}
        >
          <span className="evaluate-choice-modal__option-title">Evaluate now</span>
          <span className="evaluate-choice-modal__option-body">
            Score your resume against this job and save it to My applications.
          </span>
          {!evaluateBlockedReason && evaluateNote && (
            <span className="evaluate-choice-modal__option-note">{evaluateNote}</span>
          )}
        </button>
        {evaluateBlockedReason && <p className="evaluate-choice-modal__blocked">{evaluateBlockedReason}</p>}

        <label className="evaluate-choice-modal__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Don't ask again</span>
        </label>
      </div>
    </div>
  );
}

const STEPS = ["Score", "Tailor", "Score tailored"];

// Which of STEPS a run in progress is on.
const STEP_INDEX: Partial<Record<AutoScoreStatus, number>> = {
  queued: 0,
  scoring: 0,
  tailoring: 1,
  scoring_tailored: 2,
};

type StepState = "done" | "current" | "skipped" | "pending";

function stepState(index: number, status: AutoScoreStatus, run: AutoScoreRun | null): StepState {
  const current = STEP_INDEX[status];
  if (current !== undefined) return index < current ? "done" : index === current ? "current" : "pending";
  if (status === "ready" || status === "not_ready") return "done";
  // Below 75 the run stops after the first score — nothing to tailor.
  if (status === "below_threshold") return index === 0 ? "done" : "skipped";
  // failed: whatever finished before it stopped.
  if (index === 0 && run?.resume_score != null) return "done";
  if (index > 0 && run?.tailored_score != null) return "done";
  return "pending";
}

function ScoreFigure({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="evaluate-progress__figure">
      <span className="evaluate-progress__figure-label">{label}</span>
      {score === null ? (
        <span className="evaluate-progress__figure-empty">—</span>
      ) : (
        <span className={`stamp stamp--${fitTier(score)} evaluate-progress__figure-value`}>{score}</span>
      )}
    </div>
  );
}

function outcome(status: AutoScoreStatus, run: AutoScoreRun | null): { text: string; ready: boolean } | null {
  if (!run) return null;
  switch (status) {
    case "ready":
      return { text: "Ready to apply! Saved to My applications.", ready: true };
    case "not_ready":
      return {
        text: `Best score ${run.best_score}, even tailored. Not quite ready to apply (85+). Saved to My applications.`,
        ready: false,
      };
    case "below_threshold":
      return {
        text: `Scored ${run.resume_score}. Too low to tailor (75+). Saved to My applications as archived.`,
        ready: false,
      };
    case "failed":
      return { text: run.error ?? "The evaluation failed. Try again.", ready: false };
    default:
      return null;
  }
}

// Shown after "Evaluate now": the auto-score run's progress (score → tailor
// → score tailored), the first score and then the final one as they come
// in, and the result. "Run in background" just closes it — the run keeps
// going on the worker, and the job's button keeps showing its progress.
export function EvaluateProgressModal({
  run,
  starting,
  startError,
  applicationPath,
  onClose,
}: {
  // This job's latest run (polled by the caller). Ignored while `starting`,
  // since it may still be an older, finished one.
  run: AutoScoreRun | null;
  starting: boolean;
  startError: string | null;
  // Where "View application →" goes once the run comes out ready.
  applicationPath: string;
  onClose: () => void;
}) {
  const currentRun = starting ? null : run;
  // Stepped so each step shows for at least a second (see
  // useShownAutoScoreStatus); everything below follows it, so the bar,
  // the scores and the result change together.
  const shown = useShownAutoScoreStatus(currentRun?.status);
  const status: AutoScoreStatus = startError ? "failed" : (shown ?? "queued");
  const running = !startError && (starting || isAutoScoreActive(status));
  const pastFirstScore = status !== "queued" && status !== "scoring";
  const firstScore = pastFirstScore ? (currentRun?.resume_score ?? null) : null;
  const finalScore = running ? null : (currentRun?.best_score ?? null);
  const result = startError ? { text: startError, ready: false } : outcome(status, currentRun);
  const untailored = !running && status !== "failed" && firstScore !== null && currentRun?.tailored_score == null;

  return (
    <div className="evaluate-choice-modal__overlay" onClick={onClose}>
      <div
        className="evaluate-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Evaluating this job"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="evaluate-choice-modal__header">
          <h2>{running ? "Evaluating…" : "Evaluation"}</h2>
          <button type="button" className="evaluate-choice-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ol className="evaluate-progress__steps">
          {STEPS.map((label, index) => {
            const state = stepState(index, status, currentRun);
            return (
              <li key={label} className={`evaluate-progress__step evaluate-progress__step--${state}`}>
                <span className="evaluate-progress__step-label">
                  {state === "done" ? "✓ " : ""}
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* A run that never tailored has one score, so it shows once. */}
        {untailored ? (
          <div className="evaluate-progress__figures evaluate-progress__figures--one">
            <ScoreFigure label="Score" score={firstScore} />
          </div>
        ) : (
          <div className="evaluate-progress__figures">
            <ScoreFigure label="First score" score={firstScore} />
            <ScoreFigure label="Final score" score={finalScore} />
          </div>
        )}

        {result && (
          <p
            className={`evaluate-progress__result${
              result.ready ? " evaluate-progress__result--ready" : status === "failed" ? " evaluate-progress__result--failed" : ""
            }`}
          >
            {result.text}
          </p>
        )}

        {/* Not under a job that came out short of ready: it isn't one of them. */}
        {(running || result?.ready) && (
          <p className="evaluate-progress__hint">
            See all your ready-to-apply jobs on the <Link to="/applications">Applications page</Link>.
          </p>
        )}

        <div className="evaluate-progress__actions">
          {running ? (
            <button type="button" className="evaluate-progress__secondary" onClick={onClose}>
              Run in background
            </button>
          ) : (
            <>
              {/* Short of ready: back to the postings behind the modal. */}
              <button type="button" className="evaluate-progress__secondary" onClick={onClose}>
                {result && !result.ready && status !== "failed" ? (
                  <>
                    <ListIcon />
                    All jobs
                  </>
                ) : (
                  "Close"
                )}
              </button>
              {/* Every finished run saves the job, ready or not. */}
              {result && status !== "failed" && (
                <Link to={applicationPath} className="evaluate-progress__primary">
                  <BriefcaseIcon />
                  View application
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
