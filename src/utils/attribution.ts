import { api } from "../api/client";
import type { User } from "../api/types";
import { FIRST_TOUCH_KEY, readFirstTouch, trackAuthCompleted, trackEvent, type AuthTrigger, type FirstTouch } from "./analytics";

// Share attribution (the backend's app.services.job_shares). A shared job
// link carries a random share id, ?ref=share&sid=<id>, made at the tap so the
// share sheet opens at once. The first visit on a device is kept (first
// touch: the share id, else the campaign tags or the site that sent them,
// and the first page), and sent once right after sign-up.

const SHARE_ID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const JOB_PATH_RE = /^\/jobs\/([0-9a-f-]{36})\/?$/;

// 16 random bytes, base64url: 22 characters.
export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function shareUrl(jobId: string, shareId: string): string {
  return `${window.location.origin}/jobs/${jobId}?ref=share&sid=${shareId}`;
}

// Once, as the app starts (after initAnalytics): counts a shared link
// opened, and keeps this visit as the first touch if there's none yet.
export function captureLanding() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const shareId = sid && SHARE_ID_RE.test(sid) ? sid : null;
  if (shareId) {
    trackEvent("shared_link_opened", { share_id: shareId });
    const job = window.location.pathname.match(JOB_PATH_RE);
    if (job) trackEvent("shared_job_viewed", { share_id: shareId, job_id: job[1] });
  }
  if (readFirstTouch() !== null) return;
  let referrer: string | null = null;
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    referrer = host && host !== window.location.hostname ? host : null;
  } catch {
    // An unreadable referrer: none.
  }
  const touch: FirstTouch = {
    share_id: shareId,
    source: params.get("utm_source") ?? (shareId ? "share" : (referrer ?? "direct")),
    medium: params.get("utm_medium") ?? (shareId ? "share" : referrer ? "referral" : "none"),
    campaign: params.get("utm_campaign"),
    landing_page: window.location.pathname,
  };
  try {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    // Storage blocked: nothing is kept.
  }
}

// After signing in: counted (trackAuthCompleted), and a new account's first
// touch sent, best-effort.
export function trackSignIn(method: string, trigger: AuthTrigger, user: User) {
  if (!trackAuthCompleted(method, trigger, user)) return;
  const touch = readFirstTouch();
  if (touch?.share_id) trackEvent("shared_registration", { share_id: touch.share_id });
  api.post("/auth/me/attribution", touch ?? {}).catch(() => {});
}

// Records a share made signed in, so a sign-up it brings is credited.
// Best-effort: the link works without it.
export function recordShare(shareId: string, jobId: string, method: "share_sheet" | "copy_link") {
  api.post("/shares", { id: shareId, job_url_id: jobId, method }).catch(() => {});
}
