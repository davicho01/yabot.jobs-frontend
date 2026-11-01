import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent } from "../utils/analytics";
import {
  REMIND_LATER_MS,
  countVisit,
  loadSurveyState,
  saveSurveyState,
  shouldInvite,
  type SurveyState,
} from "../utils/survey";
import { SurveyModal } from "./SurveyModal";
import "./SurveyModal.css";

// How long a page is open before the invite appears, so it never greets
// someone the moment they land.
const INVITE_DELAY_MS = 15_000;

// Pages where an invite would get in the way of signing in.
const QUIET_PATHS = ["/login", "/auth", "/oauth"];

// The in-site survey (POST /survey): a small invite — Take it now / Remind me
// later (asks again in 3 days) / No thanks — shown from a visitor's 2nd visit,
// plus a corner badge that opens the survey any time until it's finished.
export function SurveyProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<SurveyState>(() => countVisit(loadSurveyState()));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const update = useCallback((patch: Partial<SurveyState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      saveSurveyState(next);
      return next;
    });
  }, []);

  const quietPage = QUIET_PATHS.some((path) => location.pathname.startsWith(path));

  useEffect(() => {
    if (quietPage || formOpen || !shouldInvite(state)) return;
    const timer = window.setTimeout(() => {
      setInviteOpen(true);
      trackEvent("survey_invite_shown");
    }, INVITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, quietPage, formOpen]);

  const openSurvey = useCallback(() => {
    setInviteOpen(false);
    setFormOpen(true);
    trackEvent("survey_opened");
  }, []);

  function remindLater() {
    setInviteOpen(false);
    update({ status: "later", remindAt: Date.now() + REMIND_LATER_MS });
    trackEvent("survey_invite_later");
  }

  function noThanks() {
    setInviteOpen(false);
    update({ status: "dismissed", remindAt: null });
    trackEvent("survey_invite_dismissed");
  }

  return (
    <>
      {children}

      {inviteOpen && !formOpen && (
        <div className="survey-invite" role="dialog" aria-label="Take our survey">
          <h2>Help us improve yabot.jobs?</h2>
          <p>A 2-minute survey: how you found us, what you&apos;re looking for, and what to build next.</p>
          <div className="survey-invite__actions">
            <button type="button" className="survey-invite__primary" onClick={openSurvey}>
              Take it now
            </button>
            <button type="button" onClick={remindLater}>
              Remind me later
            </button>
            <button type="button" onClick={noThanks}>
              No thanks
            </button>
          </div>
        </div>
      )}

      {!formOpen && state.status !== "done" && !quietPage && (
        <button type="button" className="survey-badge" onClick={openSurvey}>
          Quick survey
        </button>
      )}

      {formOpen && (
        <SurveyModal
          visitorId={state.visitorId}
          onDone={() => update({ status: "done", remindAt: null })}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
