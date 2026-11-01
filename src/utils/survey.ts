// Where this browser is with the in-site survey (see SurveyProvider): how many
// visits it has made, whether it was invited and said "later" / "no thanks",
// and whether it finished. Kept in this browser only. The visitor id is what
// the backend keys a response on, so signed-out visitors can answer too.
export type SurveyStatus = "none" | "later" | "dismissed" | "done";

export interface SurveyState {
  visitorId: string;
  status: SurveyStatus;
  // Epoch ms; only meaningful while status is "later".
  remindAt: number | null;
  visits: number;
}

const STORAGE_KEY = "yabot.survey";
const VISIT_COUNTED_KEY = "yabot.survey.visitCounted";

// "Remind me later" asks again after this long.
export const REMIND_LATER_MS = 3 * 24 * 60 * 60 * 1000;
// The invite shows on the very first visit too (see INVITE_DELAY_MS in
// SurveyProvider: only after a minute on the page), since most visitors never
// come back. The count is kept so this can be raised again.
const MIN_VISITS_FOR_INVITE = 1;

function newVisitorId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function freshState(): SurveyState {
  return { visitorId: newVisitorId(), status: "none", remindAt: null, visits: 0 };
}

// Storage can be blocked (private windows, cleared site data) — then every
// load looks like a first visit, so the invite never shows and only the badge
// is left; the survey still works.
export function loadSurveyState(): SurveyState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed.visitorId === "string") {
      const status: SurveyStatus = ["none", "later", "dismissed", "done"].includes(parsed.status)
        ? parsed.status
        : "none";
      return {
        visitorId: parsed.visitorId,
        status,
        remindAt: typeof parsed.remindAt === "number" ? parsed.remindAt : null,
        visits: typeof parsed.visits === "number" ? parsed.visits : 0,
      };
    }
  } catch {
    // Fall through to a fresh state.
  }
  return freshState();
}

export function saveSurveyState(state: SurveyState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not remembered — the invite just may show again.
  }
}

// Counts a visit once per browser tab session (not per page view). A state
// with no visits yet is always counted and saved, even when this tab already
// marked a visit: the saved state can be cleared (site data, devtools) while
// the tab's own flag survives, and the visitor would otherwise never be
// counted, so the invite would never show.
export function countVisit(state: SurveyState): SurveyState {
  try {
    if (state.visits > 0 && window.sessionStorage.getItem(VISIT_COUNTED_KEY)) return state;
    window.sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
  } catch {
    return state;
  }
  const next = { ...state, visits: state.visits + 1 };
  saveSurveyState(next);
  return next;
}

export function shouldInvite(state: SurveyState, now: number = Date.now()): boolean {
  if (state.status === "later") return state.remindAt !== null && now >= state.remindAt;
  return state.status === "none" && state.visits >= MIN_VISITS_FOR_INVITE;
}
