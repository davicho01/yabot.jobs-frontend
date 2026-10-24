import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { POST_LOGIN_NEXT_KEY } from "../auth/postLogin";
import { GOOGLE_CLIENT_ID } from "../auth/google";
import { ApiError } from "../api/client";
import { jobsApi } from "../api/jobs";
import type { JobDetail } from "../api/types";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { trackEvent } from "../utils/analytics";
import { suggestEmailFix } from "../utils/emailTypo";
import "../pages/LoginPage.css";
import "./SignInModal.css";

// Sign-in in a window over the page, for someone signed out who tapped a
// posting's Apply ↗ (see SignInPromptContext). Signed in with Google, it
// offers the company's site, one tap away; by email, the link lands on the posting's
// page, which has Apply ↗ too.
export function SignInModal({ job, onClose }: { job: JobDetail; onClose: () => void }) {
  const { requestLink, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "signing-in" | "signed-in" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Signed out, the job came without its employer link; it's fetched again
  // once signed in.
  const [companyUrl, setCompanyUrl] = useState(job.url.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function handleGoogleCredential(credential: string) {
    setStatus("signing-in");
    setError(null);
    try {
      await signInWithGoogle(credential);
      trackEvent("login", { method: "google" });
      setCompanyUrl((await jobsApi.get(job.url.id)).url.url);
      // Not window.open here: browsers block a new tab that isn't opened
      // by a tap, so "Continue to apply" below opens it.
      setStatus("signed-in");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      // The emailed link lands on /auth/callback, which reads this back.
      sessionStorage.setItem(POST_LOGIN_NEXT_KEY, `/jobs/${job.url.id}`);
      await requestLink(email);
      trackEvent("sign_in_link_requested");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  const emailFix = suggestEmailFix(email);

  // On <body>, so the swipe board's moving row can't shift or clip it.
  return createPortal(
    <div className="sign-in-modal__overlay" onClick={onClose}>
      <div
        className="login-card sign-in-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to apply"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="login-card__tab">Sign-in</div>
        <button type="button" className="sign-in-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {status === "signed-in" ? (
          <>
            <h2 className="login-card__title">You're in.</h2>
            <p className="login-card__subtitle">On to the company's site to apply.</p>
            <a
              href={companyUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="sign-in-modal__continue"
              onClick={() => {
                trackEvent("job_site_click", { job_id: job.url.id });
                onClose();
              }}
            >
              Continue to apply ↗
            </a>
          </>
        ) : status === "sent" ? (
          <>
            <h2 className="login-card__title">Check your email.</h2>
            <div className="login-card__sent">
              <span className="stamp stamp--positive">Link sent</span>
              <p>
                We sent a sign-in link to <strong>{email}</strong>. It opens this posting, ready to apply.
              </p>
              <p>Don't see it? Check your spam or Promotions folder.</p>
            </div>
          </>
        ) : (
          <>
            <h2 className="login-card__title">Sign in to apply.</h2>
            <p className="login-card__subtitle">
              {GOOGLE_CLIENT_ID
                ? "No password: continue with Google and you'll go straight on to the company's site."
                : "No password, just a one-time sign-in link in your inbox."}
            </p>
            <GoogleSignInButton onCredential={handleGoogleCredential} />
            {GOOGLE_CLIENT_ID && <div className="login-card__divider">or</div>}
            <form onSubmit={handleSubmit} className="login-card__form">
              <label htmlFor="sign-in-modal-email">Email address</label>
              <input
                id="sign-in-modal-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {emailFix && (
                <button type="button" className="login-card__typo" onClick={() => setEmail(emailFix)}>
                  Did you mean <strong>{emailFix}</strong>?
                </button>
              )}
              {error && <p className="login-card__error">{error}</p>}
              <button type="submit" disabled={status === "sending" || status === "signing-in"}>
                {status === "sending" ? "Sending…" : status === "signing-in" ? "Signing in…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
