import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { trackEvent } from "../utils/analytics";
import { trackSignIn } from "../utils/attribution";
import { POST_LOGIN_NEXT_KEY, postLoginDestination } from "../auth/postLogin";
import "./LoginPage.css";

export function AuthCallbackPage() {
  const { verify } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = searchParams.get("token");
    const requestedNext = searchParams.get("next") || sessionStorage.getItem(POST_LOGIN_NEXT_KEY);
    if (!token) {
      setError("Missing sign-in token.");
      return;
    }
    verify(token)
      .then(async (user) => {
        trackSignIn("email_link", requestedNext ? "page" : "direct", user);
        if (requestedNext) trackEvent("action_resumed", { action: "page" });
        navigate(await postLoginDestination(requestedNext), { replace: true });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "That link is invalid or expired."));
  }, [searchParams, verify, navigate]);

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-card__tab">Verifying</div>
        {error ? (
          <>
            <h1 className="login-card__title">Link didn't work</h1>
            <p className="login-card__subtitle">{error}</p>
            <a href="/login">Request a new link</a>
          </>
        ) : (
          <>
            <h1 className="login-card__title">Signing you in…</h1>
            <p className="login-card__subtitle">One moment.</p>
          </>
        )}
      </div>
    </main>
  );
}
