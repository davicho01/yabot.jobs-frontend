import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../api/billing";
import { ApiError } from "../api/client";
import { AI_ACCESS_QUERY_KEY, ONBOARDING_QUERY_KEY } from "../api/onboarding";
import type { AiAccess } from "../api/types";
import "./PlanSection.css";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// A subscription that still exists but whose payment failed — fixed by
// updating the card in the customer portal, not by subscribing again (which
// would start a second subscription). Mirrors the backend's
// app.services.billing.PAYMENT_ISSUE_STATUSES.
const PAYMENT_ISSUE_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);

// After Stripe Checkout redirects back, the subscription only shows up once
// Stripe's webhook has reached the backend — usually a second or two. Poll
// until it does rather than showing "not subscribed" to someone who just paid.
const CONFIRM_POLL_MS = 2000;
const CONFIRM_POLL_ATTEMPTS = 15;

// The paid plan on the AI API Keys page: subscribe (Stripe Checkout) or,
// once subscribed, see the plan and manage it (Stripe customer portal).
// Renders nothing when the plan isn't offered and the user isn't on it.
export function PlanSection({ access }: { access: AiAccess }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutResult = searchParams.get("checkout");
  const [confirmAttempts, setConfirmAttempts] = useState(0);

  const redirect = (url: string) => window.location.assign(url);
  const checkoutMutation = useMutation({ mutationFn: billingApi.checkout, onSuccess: ({ url }) => redirect(url) });
  const portalMutation = useMutation({ mutationFn: billingApi.portal, onSuccess: ({ url }) => redirect(url) });
  const error = checkoutMutation.error ?? portalMutation.error;

  const waitingForWebhook =
    checkoutResult === "success" && !access.subscribed && confirmAttempts < CONFIRM_POLL_ATTEMPTS;
  useEffect(() => {
    if (!waitingForWebhook) return;
    const timer = window.setTimeout(() => {
      setConfirmAttempts((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: AI_ACCESS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    }, CONFIRM_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForWebhook, confirmAttempts, queryClient]);

  const clearCheckoutResult = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("checkout");
        return next;
      },
      { replace: true },
    );

  if (!access.subscribed && !access.subscription_available) return null;

  let notice: ReactNode = null;
  if (checkoutResult === "success") {
    notice = access.subscribed ? (
      <p className="plan-section__notice plan-section__notice--success">
        You're subscribed. Every AI feature now works without a key of your own.{" "}
        <button type="button" onClick={clearCheckoutResult}>
          Dismiss
        </button>
      </p>
    ) : waitingForWebhook ? (
      <p className="plan-section__notice">Confirming your subscription with Stripe…</p>
    ) : (
      <p className="plan-section__notice">
        Your payment went through, but your plan hasn't shown up yet. Refresh the page in a minute. If it's still
        missing, send us a message from Help &amp; support.
      </p>
    );
  } else if (checkoutResult === "canceled") {
    notice = (
      <p className="plan-section__notice">
        Checkout canceled. You haven't been charged.{" "}
        <button type="button" onClick={clearCheckoutResult}>
          Dismiss
        </button>
      </p>
    );
  }

  return (
    <section className={`settings-section plan-section${access.subscribed ? " plan-section--active" : ""}`}>
      {notice}
      {access.subscribed ? (
        <>
          <div className="plan-section__header">
            <h2>AI plan</h2>
            <span className="stamp stamp--positive">Active</span>
          </div>
          <p className="settings-section__hint">
            {access.subscription_price_label}. Scoring, tailoring, and cover letters run on Yabot Jobs' AI, so you
            don't need a key of your own.
            {access.subscription_current_period_end &&
              (access.subscription_cancel_at_period_end
                ? ` Ends on ${formatDate(access.subscription_current_period_end)} and won't renew.`
                : ` Renews on ${formatDate(access.subscription_current_period_end)}.`)}
          </p>
          {access.subscription_request_limit > 0 && (
            <p className="plan-section__usage">
              {access.subscription_requests_used} of {access.subscription_request_limit} AI requests used this
              period.
            </p>
          )}
          <button
            type="button"
            className="plan-section__secondary"
            disabled={portalMutation.isPending}
            onClick={() => portalMutation.mutate()}
          >
            {portalMutation.isPending ? "Opening…" : "Manage billing"}
          </button>
        </>
      ) : (
        <>
          <div className="plan-section__header">
            <h2>Skip the key for {access.subscription_price_label}</h2>
          </div>
          <p className="settings-section__hint">
            Don't want to set up an AI provider account? Subscribe and every AI feature (scoring, tailoring, cover
            letters, interview prep) runs on Yabot Jobs' AI. Cancel anytime.
          </p>
          {PAYMENT_ISSUE_STATUSES.has(access.subscription_status ?? "") ? (
            <>
              <p className="plan-section__notice">
                Your last payment didn't go through, so your plan is paused until your card is updated.
              </p>
              <button
                type="button"
                className="plan-section__primary"
                disabled={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
              >
                {portalMutation.isPending ? "Opening…" : "Update your card"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="plan-section__primary"
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate()}
            >
              {checkoutMutation.isPending ? "Opening checkout…" : `Subscribe for ${access.subscription_price_label}`}
            </button>
          )}
        </>
      )}
      {error && (
        <p className="settings-page__error">{error instanceof ApiError ? error.message : "Something went wrong."}</p>
      )}
    </section>
  );
}
