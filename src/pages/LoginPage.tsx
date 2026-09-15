import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./LoginPage.css";

export function LoginPage() {
  const { requestLink } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await requestLink(email);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-card__tab">Sign-in slip</div>
        <h1 className="login-card__title">Find your next case</h1>
        <p className="login-card__subtitle">
          No password to remember — we email you a one-time link to sign in.
        </p>

        {status === "sent" ? (
          <div className="login-card__sent">
            <span className="stamp stamp--positive">Link sent</span>
            <p>
              Check <strong>{email}</strong> for a sign-in link. It expires in 15 minutes.
            </p>
          </div>
        ) : (
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
            {error && <p className="login-card__error">{error}</p>}
            <button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
        {searchParams.get("next") && status !== "sent" && (
          <p className="login-card__hint">You'll return to where you left off after signing in.</p>
        )}
      </div>
    </main>
  );
}
