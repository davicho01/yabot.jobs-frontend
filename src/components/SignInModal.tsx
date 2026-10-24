import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { SignInPromptContext } from "../auth/signInPrompt";
import { GOOGLE_CLIENT_ID } from "../auth/google";
import { ApiError } from "../api/client";
import { jobsApi } from "../api/jobs";
import type { JobDetail } from "../api/types";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { EmailCodeSignIn } from "./EmailCodeSignIn";
import { trackEvent } from "../utils/analytics";
import "../pages/LoginPage.css";
import "./SignInModal.css";

// Sign-in in a window over the page, for someone signed out who tapped a
// posting's Apply ↗ (see SignInPromptProvider below). With Google or an emailed
// code, it signs in right here, then offers the company's site a tap away.
export function SignInModal({ job, onClose }: { job: JobDetail; onClose: () => void }) {
  const { signInWithGoogle, verifyCode } = useAuth();
  const [status, setStatus] = useState<"idle" | "signing-in" | "signed-in">("idle");
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

  // Not window.open: browsers block a new tab that isn't opened by a tap,
  // so "Continue to apply" opens it.
  async function signedIn(method: string) {
    trackEvent("login", { method });
    setCompanyUrl((await jobsApi.get(job.url.id)).url.url);
    setStatus("signed-in");
  }

  async function handleGoogleCredential(credential: string) {
    setStatus("signing-in");
    setError(null);
    try {
      await signInWithGoogle(credential);
      await signedIn("google");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    }
  }

  async function verifyEmailCode(email: string, code: string) {
    await verifyCode(email, code);
    await signedIn("email_code");
  }

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
        ) : (
          <>
            <h2 className="login-card__title">Sign in to apply.</h2>
            <p className="login-card__subtitle">
              {GOOGLE_CLIENT_ID
                ? "No password: continue with Google, or get a one-time code by email."
                : "No password, just a one-time code by email."}
            </p>
            <GoogleSignInButton onCredential={handleGoogleCredential} />
            {status === "signing-in" && <p className="login-card__hint">Signing in…</p>}
            {error && <p className="login-card__error">{error}</p>}
            {GOOGLE_CLIENT_ID && <div className="login-card__divider">or</div>}
            <EmailCodeSignIn idPrefix="sign-in-modal" verify={verifyEmailCode} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Around the whole app: a signed-out Apply ↗ anywhere opens SignInModal for
// its job (see CompanySiteLink) instead of leaving for /login.
export function SignInPromptProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  return (
    <SignInPromptContext.Provider value={setJob}>
      {children}
      {job && <SignInModal job={job} onClose={() => setJob(null)} />}
    </SignInPromptContext.Provider>
  );
}
