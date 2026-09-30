import type { AiAccess } from "../api/types";
import { getLlmProvider } from "../data/llmProviders";
import { freeEvaluationsPhrase } from "../utils/onboarding";
import "./ActiveSourceNotice.css";

function ownKeyName(access: AiAccess): string {
  const provider = getLlmProvider(access.own_key_provider ?? "");
  const name = provider?.label ?? access.own_key_provider ?? "API";
  const model = access.own_key_model ?? provider?.defaultModel;
  return model ? `Your ${name} key (${model})` : `Your ${name} key`;
}

// The one-line answer to "what are my AI requests running on right now?" at
// the top of the AI access page. Comes straight from GET /ai-access's
// active_source, which uses the same order the backend applies to every
// request (plan, then own key, then free evaluations), so the two can't
// disagree.
export function ActiveSourceNotice({ access }: { access: AiAccess }) {
  let title: string;
  let detail: string;
  switch (access.active_source) {
    case "subscription":
      title = `Yabot Jobs AI (${access.subscription_price_label} plan)`;
      detail = access.has_own_key
        ? "Your saved key is paused while the plan is active, so your provider isn't billed."
        : "Every AI feature is included.";
      break;
    case "own_key":
      title = ownKeyName(access);
      detail = "Your provider bills you directly for what you use.";
      break;
    case "free_trial":
      title = `Free evaluations: ${access.free_evaluations_remaining} of ${access.free_evaluation_limit} left`;
      detail =
        "They cover job scoring. For tailoring, cover letters, and unlimited scoring, add a key" +
        (access.subscription_available ? ` or subscribe for ${access.subscription_price_label}.` : ".");
      break;
    default:
      title = "Nothing set up yet";
      detail =
        access.free_trial_enabled && access.free_evaluations_used > 0
          ? `You've used your ${freeEvaluationsPhrase(access.free_evaluation_limit)}. ` +
            "Pick an option below to keep going."
          : "Pick an option below to turn on the AI features.";
  }

  return (
    <div className={`active-source${access.active_source ? "" : " active-source--none"}`} role="status">
      <span className="active-source__label">Your AI requests use</span>
      <strong className="active-source__title">{title}</strong>
      <span className="active-source__detail">{detail}</span>
    </div>
  );
}
