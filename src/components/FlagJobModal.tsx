import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "../api/jobs";
import { ApiError } from "../api/client";
import type { FlagReason } from "../api/types";
import "./FlagJobModal.css";

const REASON_OPTIONS: { value: FlagReason; label: string }[] = [
  { value: "wrong_details", label: "Title, company, location, or salary is wrong" },
  { value: "broken_or_expired", label: "Link is broken, or the job's no longer posted" },
  { value: "garbled_description", label: "Description is garbled or cut off" },
  { value: "other", label: "Something else" },
];

// A user's report that a listing's scanned data looks wrong — see
// POST /jobs/{url_id}/flag. Purely a report: nothing here rescans the
// posting or changes what's shown, it just queues the listing for admin
// review (GET /admin/jobs?flagged=true).
export function FlagJobModal({ urlId, onClose }: { urlId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<FlagReason>("wrong_details");
  const [note, setNote] = useState("");

  const flagMutation = useMutation({
    mutationFn: () => jobsApi.flag(urlId, reason, note.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
      onClose();
    },
  });

  return (
    <div className="flag-job-modal__overlay" onClick={onClose}>
      <div
        className="flag-job-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem with this listing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flag-job-modal__header">
          <h2>Report a problem</h2>
          <button type="button" className="flag-job-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="flag-job-modal__intro">
          Let us know what's wrong with this posting — we'll look into it.
        </p>

        <label className="flag-job-modal__label" htmlFor="flag-job-modal-reason">
          What's wrong?
        </label>
        <select
          id="flag-job-modal-reason"
          className="flag-job-modal__select"
          value={reason}
          onChange={(e) => setReason(e.target.value as FlagReason)}
        >
          {REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="flag-job-modal__label" htmlFor="flag-job-modal-note">
          Details (optional)
        </label>
        <textarea
          id="flag-job-modal-note"
          className="flag-job-modal__textarea"
          value={note}
          placeholder="e.g. It says Remote but the listing is actually onsite."
          onChange={(e) => setNote(e.target.value)}
        />

        {flagMutation.isError && (
          <p className="flag-job-modal__error">
            {flagMutation.error instanceof ApiError ? flagMutation.error.message : "Something went wrong."}
          </p>
        )}

        <div className="flag-job-modal__actions">
          <button type="button" className="flag-job-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="flag-job-modal__submit"
            disabled={flagMutation.isPending}
            onClick={() => flagMutation.mutate()}
          >
            {flagMutation.isPending ? "Reporting…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
