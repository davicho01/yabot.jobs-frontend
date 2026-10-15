import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applicationsApi } from "../api/applications";
import { resumesApi } from "../api/resumes";
import "./ConfirmDialog.css";
import "./ApplyButton.css";

// The job's Apply → link, shared by /applications and the apply page. It
// opens the posting's own apply page in a new tab, and on the same click:
// - marks the application applied, only forward from "saved" (never
//   overwriting a later status like interviewing);
// - downloads the tailored resume (.docx), if there is one, ready to attach.
//
// Unless the user has ticked "Don't show this again", the click opens a
// small window instead of the company site: it shows both actions as they
// happen and has the button that continues to the site (a click of its
// own, so the new tab isn't popup-blocked).
export type ApplyTarget = {
  href: string;
  title: string | null;
  company: string | null;
  // Null when the job isn't in the user's applications — nothing to mark.
  application: { id: string; status: string } | null;
  tailored: { id: string; filename: string } | null;
};

const SKIP_APPLY_DIALOG_KEY = "yabot.skipApplyDialog";

function readSkipApplyDialog(): boolean {
  try {
    return localStorage.getItem(SKIP_APPLY_DIALOG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkipApplyDialog(skip: boolean): void {
  try {
    if (skip) localStorage.setItem(SKIP_APPLY_DIALOG_KEY, "1");
    else localStorage.removeItem(SKIP_APPLY_DIALOG_KEY);
  } catch {
    // Private mode / blocked storage: the window just keeps showing.
  }
}

export function ApplyButton({
  target,
  className,
  children = "Apply →",
}: {
  target: ApplyTarget;
  className: string;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { application, tailored } = target;
  const markApplied = useMutation({
    mutationFn: () => applicationsApi.update(application!.id, { status: "applied" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
  const download = useMutation({
    mutationFn: () => resumesApi.downloadTailored(tailored!.id, tailored!.filename, "docx"),
  });

  return (
    <>
      <a
        href={target.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={(event) => {
          if (application?.status === "saved") markApplied.mutate();
          if (tailored) download.mutate();
          if (!readSkipApplyDialog()) {
            event.preventDefault();
            setDialogOpen(true);
          }
        }}
      >
        {children}
      </a>
      {dialogOpen && (
        <ApplyDialog
          target={target}
          markApplied={application ? markApplied : null}
          download={tailored ? download : null}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

type ActionState = { isIdle: boolean; isPending: boolean; isSuccess: boolean; isError: boolean };

function ApplyDialog({
  target,
  markApplied,
  download,
  onClose,
}: {
  target: ApplyTarget;
  markApplied: ActionState | null;
  download: ActionState | null;
  onClose: () => void;
}) {
  const [skip, setSkip] = useState(readSkipApplyDialog);
  const { company, application, tailored } = target;

  const close = () => {
    writeSkipApplyDialog(skip);
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Each action shows as in progress for at least a second, even when it
  // finished sooner, so its progress bar is actually seen filling.
  const [minTimeShown, setMinTimeShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeShown(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  const settled = (action: ActionState) => minTimeShown && (action.isSuccess || action.isError);

  // markApplied stays idle when the status was already past "saved" —
  // nothing to change, but it still gets its bar and second, like the rest.
  const appliedLine = !markApplied
    ? { key: "applied", state: "none", bar: false, text: "Not in your applications — nothing to mark" }
    : markApplied.isIdle
      ? minTimeShown
        ? { key: "applied", state: "done", bar: true, text: `Already marked ${application!.status}` }
        : { key: "applied", state: "pending", bar: true, text: "Updating status…" }
      : !settled(markApplied)
        ? { key: "applied", state: "pending", bar: true, text: "Marking as applied…" }
        : markApplied.isError
          ? { key: "applied", state: "error", bar: true, text: "Couldn't mark it applied — change the status yourself." }
          : { key: "applied", state: "done", bar: true, text: "Marked as applied" };

  const downloadLine = !download
    ? { key: "download", state: "none", bar: false, text: "No tailored resume for this job yet" }
    : !settled(download)
      ? { key: "download", state: "pending", bar: true, text: `${tailored!.filename} - Downloading…` }
      : download.isError
        ? { key: "download", state: "error", bar: true, text: "Couldn't download the tailored resume — try again from the download menu." }
        : { key: "download", state: "done", bar: true, text: `${tailored!.filename} - File Downloaded` };

  return (
    <div className="confirm-dialog__overlay" onClick={close}>
      <div
        className="confirm-dialog apply-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-dialog__title" id="apply-dialog-title">
          Applying to {target.title ?? "this job"}
          {company ? ` at ${company}` : ""}
        </h2>
        <ul className="apply-dialog__steps">
          {[appliedLine, downloadLine].map((line) => (
            <li key={line.key} className={`apply-dialog__step apply-dialog__step--${line.state}`}>
              <span className="apply-dialog__step-text">
                <span className="apply-dialog__icon" aria-hidden="true">
                  {line.state === "done" ? "✓" : line.state === "error" ? "!" : line.state === "pending" ? "↻" : "–"}
                </span>
                {line.text}
              </span>
              {line.bar && (
                <span className="apply-dialog__bar" aria-hidden="true">
                  <span className="apply-dialog__bar-fill" />
                </span>
              )}
            </li>
          ))}
        </ul>
        <label className="apply-dialog__skip">
          <input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} />
          Don't show this again
        </label>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__button" onClick={close}>
            Close
          </button>
          <a
            href={target.href}
            target="_blank"
            rel="noreferrer"
            className="confirm-dialog__button apply-dialog__continue"
            onClick={close}
          >
            Continue to {company ?? "company"} site →
          </a>
        </div>
      </div>
    </div>
  );
}
