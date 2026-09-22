import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authTokensApi } from "../api/authTokens";
import { ApiError } from "../api/client";
import "./AccessTokensPage.css";

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Never expires" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AccessTokensPage() {
  const queryClient = useQueryClient();
  const tokensQuery = useQuery({ queryKey: ["access-tokens"], queryFn: authTokensApi.list });

  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  // The raw token value only ever exists here, right after creation — the
  // list below (and every later page load) only ever has the metadata.
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      authTokensApi.create({
        label: label.trim() || "Browser extension",
        expires_in_days: expiresInDays ? Number(expiresInDays) : undefined,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      setJustCreatedToken(created.token);
      setCopied(false);
      setLabel("");
      setExpiresInDays("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => authTokensApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access-tokens"] }),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  async function copyToken() {
    if (!justCreatedToken) return;
    try {
      await navigator.clipboard.writeText(justCreatedToken);
      setCopied(true);
    } catch {
      // Clipboard access can be denied — the value is still selectable in
      // the box below, so this just skips the "Copied!" confirmation.
    }
  }

  return (
    <main className="settings-page">
      <h1>Access tokens</h1>
      <p className="settings-page__intro">
        Personal access tokens let other tools — like the browser extension — act on your behalf without your
        password. Treat one like a password: anyone who has it can use your account through it.
      </p>

      {justCreatedToken && (
        <section className="settings-section access-token-reveal">
          <p className="access-token-reveal__label">Copy this now — it won't be shown again.</p>
          <div className="access-token-reveal__row">
            <code className="access-token-reveal__value">{justCreatedToken}</code>
            <button type="button" onClick={copyToken}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button type="button" className="access-token-reveal__dismiss" onClick={() => setJustCreatedToken(null)}>
            Done
          </button>
        </section>
      )}

      <section className="settings-section">
        <form onSubmit={handleCreate} className="settings-key-form">
          <label>
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Browser extension" />
          </label>
          <label>
            Expires
            <div className="select-field">
              <select value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create token"}
          </button>
        </form>
        {createMutation.error && (
          <p className="settings-page__error">
            {createMutation.error instanceof ApiError ? createMutation.error.message : "Couldn't create token."}
          </p>
        )}

        <ul className="record-list">
          {tokensQuery.data?.map((token) => (
            <li key={token.id} className="record-list__item">
              <span>
                {token.label} · expires {formatDate(token.expires_at)}
                {token.revoked_at
                  ? ` · revoked ${formatDate(token.revoked_at)}`
                  : token.last_used_at
                    ? ` · last used ${formatDate(token.last_used_at)}`
                    : " · never used"}
              </span>
              {!token.revoked_at && (
                <button
                  type="button"
                  className="record-list__remove"
                  onClick={() => revokeMutation.mutate(token.id)}
                  disabled={revokeMutation.isPending && revokeMutation.variables === token.id}
                >
                  {revokeMutation.isPending && revokeMutation.variables === token.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          ))}
          {tokensQuery.data?.length === 0 && <li className="settings-section__hint">No access tokens yet.</li>}
        </ul>
      </section>

      <section className="settings-section">
        <h2 className="access-tokens-page__section-heading">Browser extension</h2>
        <p className="settings-section__hint">
          Create a token above — label it something like "Browser extension" — then paste it into the extension's
          settings page. It adds a "Save to Yabot Jobs" button on any page you're browsing, so you can send a
          posting straight from a job board without copying the URL over yourself. See the extension's own README
          for install steps.
        </p>
      </section>
    </main>
  );
}
