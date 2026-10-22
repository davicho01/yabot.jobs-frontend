import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { POST_LOGIN_NEXT_KEY, postLoginDestination } from "../auth/postLogin";
import { ApiError } from "../api/client";
import { GOOGLE_CLIENT_ID } from "../auth/google";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { trackEvent } from "../utils/analytics";
import { suggestEmailFix } from "../utils/emailTypo";
import "./LoginPage.css";

export function LoginPage() {
  const { requestLink, signInWithGoogle, user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mid Google sign-in, `user` gets set before handleGoogleCredential has
  // picked where to go, so hold here instead of the redirect below.
  if (googleSigningIn) return <SigningIn />;

  // Already signed in: there's nothing to do here, so go on to where the
  // link was headed (a path on this site only) or the applications list.
  if (isLoading) return null;
  if (user) {
    const next = searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    return <Navigate to={safeNext ?? "/applications"} replace />;
  }

  const emailFix = suggestEmailFix(email);

  async function sendLink() {
    // The magic-link email always points at /auth/callback with no
    // `next` (see backend's POST /auth/request-link) — stash it here so
    // AuthCallbackPage can still return the user where they started.
    const next = searchParams.get("next");
    if (next) sessionStorage.setItem(POST_LOGIN_NEXT_KEY, next);
    await requestLink(email);
    trackEvent("sign_in_link_requested");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await sendLink();
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleResend() {
    setResend("sending");
    setError(null);
    try {
      await sendLink();
      setResend("sent");
    } catch (err) {
      setResend("idle");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  function changeEmail() {
    setStatus("idle");
    setResend("idle");
    setError(null);
  }

  async function handleGoogleCredential(credential: string) {
    setGoogleSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle(credential);
      trackEvent("login", { method: "google" });
      navigate(await postLoginDestination(searchParams.get("next")), { replace: true });
    } catch (err) {
      setGoogleSigningIn(false);
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        {/* Sign-up and sign-in are the same form, since there's no password. */}
        <div className="login-card__tab">Sign-in</div>
        <h1 className="login-card__title">Find your next job.</h1>
        <p className="login-card__subtitle">
          {GOOGLE_CLIENT_ID
            ? "No password to remember: continue with Google, or get a one-time sign-in link by email."
            : "No password to remember, just a one-time sign-in link in your inbox."}
        </p>

        {status === "sent" ? (
          <div className="login-card__sent">
            <span className="stamp stamp--positive">Link sent</span>
            <p>
              Check <strong>{email}</strong> for a sign-in link. It expires in 60 minutes.
            </p>
            <p>Don't see it? Check your spam or Promotions folder.</p>
            {error && <p className="login-card__error">{error}</p>}
            <div className="login-card__sent-actions">
              <button type="button" onClick={handleResend} disabled={resend === "sending"}>
                {resend === "sending" ? "Sending…" : resend === "sent" ? "Sent again" : "Resend link"}
              </button>
              <button type="button" onClick={changeEmail}>
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <GoogleSignInButton onCredential={handleGoogleCredential} />
            {GOOGLE_CLIENT_ID && <div className="login-card__divider">or</div>}
            <form onSubmit={handleSubmit} className="login-card__form">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
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
              <button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
        {searchParams.get("next") && status !== "sent" && (
          <p className="login-card__hint">You'll return to where you left off after signing in.</p>
        )}
      </div>
    </main>
  );
}

function SigningIn() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-card__tab">Verifying</div>
        <h1 className="login-card__title">Signing you in…</h1>
        <p className="login-card__subtitle">One moment.</p>
      </div>
    </main>
  );
}
