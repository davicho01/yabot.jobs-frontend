// What the job page's "Add for evaluation" button does once someone ticks
// "Don't ask again" in EvaluateChoiceModal: "list" saves the job to My
// applications (evaluate later), "evaluate" starts an auto-score run now.
// Kept in this browser only; the reset link beside the button clears it.
export type EvaluateChoice = "list" | "evaluate";

const STORAGE_KEY = "yabot.evaluateChoice";

// Storage can be blocked (private windows, cleared site data) — then there's
// simply no saved choice and the modal asks every time.
export function loadEvaluateChoice(): EvaluateChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "list" || value === "evaluate" ? value : null;
  } catch {
    return null;
  }
}

export function saveEvaluateChoice(choice: EvaluateChoice | null): void {
  try {
    if (choice) window.localStorage.setItem(STORAGE_KEY, choice);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered — the modal just asks again next time.
  }
}
