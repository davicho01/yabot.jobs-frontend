import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { feedbackApi } from "../api/feedback";
import { ApiError } from "../api/client";
import type { FeedbackKind } from "../api/types";
// Same modal chrome as the "Report a problem" dialog — reused rather than
// copied so the two can't drift apart.
import "./FlagJobModal.css";
import "./FeedbackModal.css";

const KIND_OPTIONS: { value: FeedbackKind; label: string; placeholder: string }[] = [
  { value: "bug", label: "Something's broken", placeholder: "What happened, and what did you expect instead?" },
  { value: "question", label: "I need help", placeholder: "What are you trying to do?" },
  { value: "idea", label: "I have an idea", placeholder: "What would make Yabot Jobs more useful to you?" },
  { value: "other", label: "Something else", placeholder: "Tell us anything." },
];

const RATINGS = [1, 2, 3, 4, 5];

type FeedbackContextValue = { openFeedback: (kind?: FeedbackKind) => void };

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

// Lets any page open the one shared feedback/support form (see POST
// /feedback) — the header menu, the footer, and the Help page all use it.
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [openKind, setOpenKind] = useState<FeedbackKind | null>(null);
  const openFeedback = useCallback((kind: FeedbackKind = "other") => setOpenKind(kind), []);

  return (
    <FeedbackContext.Provider value={{ openFeedback }}>
      {children}
      {openKind && <FeedbackModal initialKind={openKind} onClose={() => setOpenKind(null)} />}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}

function FeedbackModal({ initialKind, onClose }: { initialKind: FeedbackKind; onClose: () => void }) {
  const location = useLocation();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackApi.submit({
        kind,
        message: message.trim(),
        rating,
        page_url: location.pathname + location.search,
      }),
  });

  const placeholder = KIND_OPTIONS.find((option) => option.value === kind)?.placeholder;

  return (
    <div className="flag-job-modal__overlay" onClick={onClose}>
      <div
        className="flag-job-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flag-job-modal__header">
          <h2>{submitMutation.isSuccess ? "Thanks!" : "Send feedback"}</h2>
          <button type="button" className="flag-job-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {submitMutation.isSuccess ? (
          <>
            <p className="flag-job-modal__intro">
              {kind === "question"
                ? "We got your question and will reply to your account email."
                : "We read every message. It helps decide what to build and fix next."}
            </p>
            <div className="flag-job-modal__actions">
              <button type="button" className="flag-job-modal__submit" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <fieldset className="feedback-modal__kinds">
              <legend className="flag-job-modal__label">What's this about?</legend>
              {KIND_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`feedback-modal__kind${kind === option.value ? " is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="feedback-kind"
                    value={option.value}
                    checked={kind === option.value}
                    onChange={() => setKind(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <label className="flag-job-modal__label" htmlFor="feedback-modal-message">
              Message
            </label>
            <textarea
              id="feedback-modal-message"
              className="flag-job-modal__textarea"
              value={message}
              maxLength={5000}
              placeholder={placeholder}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />

            {kind !== "question" && (
              <fieldset className="feedback-modal__rating">
                <legend className="flag-job-modal__label">How's Yabot Jobs working for you? (optional)</legend>
                <div className="feedback-modal__rating-buttons">
                  {RATINGS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={rating === value}
                      className={rating === value ? "is-active" : ""}
                      onClick={() => setRating(rating === value ? null : value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="feedback-modal__rating-scale" aria-hidden="true">
                  <span>Not great</span>
                  <span>Love it</span>
                </div>
              </fieldset>
            )}

            {submitMutation.isError && (
              <p className="flag-job-modal__error">
                {submitMutation.error instanceof ApiError ? submitMutation.error.message : "Something went wrong."}
              </p>
            )}

            <div className="flag-job-modal__actions">
              <button type="button" className="flag-job-modal__cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="flag-job-modal__submit"
                disabled={submitMutation.isPending || !message.trim()}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
