import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { oauthApi, type OAuthAuthorizationRequest } from "../api/oauth";
import { ApiError } from "../api/client";
import "./LoginPage.css";

// Reached from a Claude-initiated OAuth flow (see yabot-jobs-mcp's
// authorize() provider method), already behind ProtectedRoute so the user
// is guaranteed to have a session by the time this renders.
export function OAuthAuthorizePage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request_id");

  const [request, setRequest] = useState<OAuthAuthorizationRequest | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "deciding" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setError("Missing authorization request.");
      setStatus("error");
      return;
    }
    oauthApi
      .getAuthorizationRequest(requestId)
      .then((req) => {
        setRequest(req);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "This authorization request is invalid or has expired.");
        setStatus("error");
      });
  }, [requestId]);

  async function decide(action: "approve" | "deny") {
    if (!requestId) return;
    setStatus("deciding");
    try {
      const { redirect_url } = await (action === "approve" ? oauthApi.approve(requestId) : oauthApi.deny(requestId));
      window.location.href = redirect_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setStatus("error");
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-card__tab">Connect</div>
        {status === "error" && (
          <>
            <h1 className="login-card__title">Can't continue</h1>
            <p className="login-card__subtitle">{error}</p>
          </>
        )}
        {(status === "loading" || (status === "deciding" && !request)) && (
          <>
            <h1 className="login-card__title">One moment…</h1>
            <p className="login-card__subtitle">Loading the request.</p>
          </>
        )}
        {request && status !== "error" && (
          <>
            <h1 className="login-card__title">{request.client_name} wants access</h1>
            <p className="login-card__subtitle">
              This will let <strong>{request.client_name}</strong> search jobs, manage your applications, and
              read/upload resumes and cover letters on your behalf, using your Yabot Jobs account.
            </p>
            <div className="login-card__form">
              <button type="button" disabled={status === "deciding"} onClick={() => decide("approve")}>
                {status === "deciding" ? "Connecting…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={status === "deciding"}
                onClick={() => decide("deny")}
                style={{ background: "transparent", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
              >
                Deny
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
