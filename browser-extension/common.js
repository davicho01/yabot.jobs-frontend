// Shared between background.js, popup.js, and options.js — an ES module,
// loaded the same way in all three (service worker "type": "module" in
// manifest.json, and <script type="module"> in the two HTML pages).

export async function getConfig() {
  const { apiBaseUrl, token } = await chrome.storage.local.get(["apiBaseUrl", "token"]);
  // Trailing slash trimmed once here so every apiFetch call below can just
  // concatenate a leading-slash path without checking for a double slash.
  return { apiBaseUrl: (apiBaseUrl || "").replace(/\/+$/, ""), token: token || "" };
}

export async function setConfig({ apiBaseUrl, token }) {
  await chrome.storage.local.set({ apiBaseUrl, token });
}

export async function apiFetch(path, options = {}) {
  const { apiBaseUrl, token } = await getConfig();
  if (!apiBaseUrl) throw new Error("Set the Yabot Jobs API URL in the extension's options first.");
  if (!token) throw new Error("Set your access token in the extension's options first.");

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    // The backend's error responses are {"detail": "..."} (FastAPI's
    // default shape) — surface that when present, a flatter message
    // otherwise (a non-JSON body, e.g. from a proxy in front of the API).
    let detail = res.statusText || `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      // Body wasn't JSON — stick with the fallback above.
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function saveJobUrl(url) {
  return apiFetch("/jobs", { method: "POST", body: JSON.stringify({ url }) });
}

export function whoAmI() {
  return apiFetch("/auth/me");
}

// A page a "Save" action wouldn't make sense on — the browser's own
// internal pages (chrome://, about:, the extension's own popup/options,
// etc.), where there is no job posting to submit.
export function isSaveableUrl(url) {
  return !!url && /^https?:\/\//i.test(url);
}
