import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { postLoginDestination } from "../auth/postLogin";
import { ApiError } from "../api/client";
import { GOOGLE_CLIENT_ID } from "../auth/google";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { EmailCodeSignIn } from "../components/EmailCodeSignIn";
import { trackEvent } from "../utils/analytics";
import "./LoginPage.css";

export function LoginPage() {
  const { signInWithGoogle, verifyCode, user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mid Google sign-in, `user` gets set before handleGoogleCredential has
  // picked where to go, so hold here instead of the redirect below.
  if (signingIn === "google") return <SigningIn />;

  // Already signed in: there's nothing to do here, so go on to where the
  // link was headed (a path on this site only) or the applications list.
  // Not mid email sign-in, which picks where to go itself, like Google's.
  if (isLoading) return null;
  if (user && signingIn !== "email") {
    const next = searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    return <Navigate to={safeNext ?? "/applications"} replace />;
  }

  async function handleGoogleCredential(credential: string) {
    setSigningIn("google");
    setError(null);
    try {
      await signInWithGoogle(credential);
      trackEvent("login", { method: "google" });
      navigate(await postLoginDestination(searchParams.get("next")), { replace: true });
    } catch (err) {
      setSigningIn(null);
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    }
  }

  async function verifyEmailCode(email: string, code: string) {
    setSigningIn("email");
    try {
      await verifyCode(email, code);
    } catch (err) {
      setSigningIn(null);
      throw err;
    }
    trackEvent("login", { method: "email_code" });
    navigate(await postLoginDestination(searchParams.get("next")), { replace: true });
  }

  return (
    <main className="login-page">
      <div className="login-card">
        {/* Sign-up and sign-in are the same form, since there's no password. */}
        <div className="login-card__tab">Sign-in</div>
        <h1 className="login-card__title">Find your next job.</h1>
        <p className="login-card__subtitle">
          {GOOGLE_CLIENT_ID
            ? "No password to remember: continue with Google, or get a one-time code by email."
            : "No password to remember, just a one-time code in your inbox."}
        </p>

        <GoogleSignInButton onCredential={handleGoogleCredential} />
        {error && <p className="login-card__error">{error}</p>}
        {GOOGLE_CLIENT_ID && <div className="login-card__divider">or</div>}
        <EmailCodeSignIn idPrefix="login" verify={verifyEmailCode} />
        {searchParams.get("next") && (
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
