import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { lastEmail } from "../auth/lastEmail";
import { ApiError } from "../api/client";
import { trackEvent } from "../utils/analytics";
import { suggestEmailFix } from "../utils/emailTypo";

const CODE_LENGTH = 6;

// Signing in by email: we send a six-digit code, typed in right here, so
// whatever someone was doing (the Apply they tapped) carries on after.
// Styled by LoginPage.css's .login-card__form; used by LoginPage and
// SignInModal. `verify` signs in with the code (AuthContext's verifyCode
// plus whatever comes after) and throws on a wrong one. The email starts
// as the last one signed in on this device (see auth/lastEmail).
export function EmailCodeSignIn({
  idPrefix,
  verify,
}: {
  idPrefix: string;
  verify: (email: string, code: string) => Promise<void>;
}) {
  const { requestCode } = useAuth();
  const [email, setEmail] = useState(lastEmail);
  const emailRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState<"sending" | "verifying" | null>(null);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailFix = suggestEmailFix(email);

  async function sendCode() {
    await requestCode(email);
    trackEvent("sign_in_code_requested");
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    setBusy("sending");
    setError(null);
    try {
      await sendCode();
      setStep("code");
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function submitCode(value: string) {
    setBusy("verifying");
    setError(null);
    try {
      await verify(email, value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  async function handleResend() {
    setBusy("sending");
    setError(null);
    try {
      await sendCode();
      setResent(true);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (step === "code") {
    return (
      <form
        className="login-card__form"
        onSubmit={(e) => {
          e.preventDefault();
          submitCode(code);
        }}
      >
        <p className="login-card__code-sent">
          We sent a {CODE_LENGTH}-digit code to <strong>{email}</strong>. It expires in 15 minutes.
        </p>
        <label htmlFor={`${idPrefix}-code`}>Sign-in code</label>
        <input
          id={`${idPrefix}-code`}
          className="login-card__code"
          // one-time-code: the phone offers the code from the email (or a
          // text) above the keyboard. No maxLength, which would cut a pasted
          // "744 350" short; onChange keeps just the digits.
          name="one-time-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          pattern={`\\d{${CODE_LENGTH}}`}
          value={code}
          placeholder="••••••"
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
            setCode(digits);
            // A pasted or autofilled code goes straight in.
            if (digits.length === CODE_LENGTH && busy === null) submitCode(digits);
          }}
        />
        {error && <p className="login-card__error">{error}</p>}
        <button type="submit" disabled={busy !== null || code.length !== CODE_LENGTH}>
          {busy === "verifying" ? "Signing in…" : "Sign in"}
        </button>
        <p className="login-card__code-help">Don't see it? Check your spam or Promotions folder.</p>
        <div className="login-card__sent-actions">
          <button type="button" onClick={handleResend} disabled={busy !== null}>
            {busy === "sending" ? "Sending…" : resent ? "Sent again" : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setResent(false);
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmail} className="login-card__form">
      <label htmlFor={`${idPrefix}-email`}>Email address</label>
      <div className="login-card__email">
        <input
          ref={emailRef}
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {/* Clears a remembered (or mistyped) email in one tap. */}
        {email && (
          <button
            type="button"
            className="login-card__email-clear"
            aria-label="Clear email"
            onClick={() => {
              setEmail("");
              emailRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {emailFix && (
        <button type="button" className="login-card__typo" onClick={() => setEmail(emailFix)}>
          Did you mean <strong>{emailFix}</strong>?
        </button>
      )}
      {error && <p className="login-card__error">{error}</p>}
      <button type="submit" disabled={busy !== null}>
        {busy === "sending" ? "Sending…" : "Email me a code"}
      </button>
    </form>
  );
}
