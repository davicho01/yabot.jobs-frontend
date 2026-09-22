# Yabot Jobs browser extension

Adds a "Save to Yabot Jobs" button to your toolbar (and a right-click menu
entry) so you can send whatever job posting you're looking at straight to
your board, without copying the URL over to the app yourself.

It's a plain Manifest V3 extension — no build step, no bundler. Chrome,
Edge, Brave, and other Chromium-based browsers can load it as-is.

## What it does

- **Toolbar popup**: shows the current tab's URL and a "Save to Yabot
  Jobs" button. Click it, and the posting is submitted the same way
  pasting the URL into the app's "Add a job" box would be.
- **Right-click menu**: "Save this page to Yabot Jobs" (on any page) and
  "Save this link to Yabot Jobs" (on a link, e.g. a listing on a search
  results page) — saves without opening the popup at all. The toolbar
  icon briefly shows a ✓ or ! to confirm it worked.
- **Settings page**: where you connect the extension to your account (see
  below) — reachable from the popup's gear icon, or the browser's own
  `chrome://extensions` page.

It only ever talks to the Yabot Jobs API URL you configure — nothing else,
and nothing is sent anywhere else.

## Install (unpacked — this isn't published to the Chrome Web Store)

1. Open `chrome://extensions` (or your browser's equivalent — Edge:
   `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `browser-extension/` folder.
4. The Yabot Jobs icon appears in your toolbar. Click it once — since
   nothing's configured yet, it'll prompt you to open settings.

## Connect it to your account

The extension authenticates with a **personal access token**, not your
email/password — the same mechanism the MCP server uses.

1. Sign in to the Yabot Jobs web app.
2. Open your account menu → **Access tokens**.
3. Create one (label it something like "Browser extension" so you can
   recognize it later; leave the expiry as "Never expires" unless you'd
   rather rotate it periodically).
4. **Copy the token immediately** — it's shown once, right at creation,
   and never again. If you lose it, revoke it and create a new one.
5. Open the extension's settings (its gear icon, or right-click the
   toolbar icon → Options):
   - **Yabot Jobs API URL**: the backend's own URL (not the web app's —
     e.g. `https://api.yabot.jobs`, or wherever your deployment's API is
     reachable). Ask whoever deployed it if you're not sure.
   - **Access token**: paste the token from step 4.
6. Click **Test connection** — it should show "Connected as
   your@email.com". If it doesn't, double check the API URL (a trailing
   slash is fine, it's stripped automatically) and that the token wasn't
   mistyped or already revoked.
7. Click **Save**.

## Revoking access

Lost a device, or just done with the extension? Go back to **Access
tokens** in the web app and revoke that token — it stops working
immediately, no need to touch the extension itself.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension metadata, permissions, entry points |
| `common.js` | Shared storage access + authenticated API calls |
| `background.js` | The right-click context menu (service worker) |
| `popup.html` / `popup.js` / `popup.css` | The toolbar popup |
| `options.html` / `options.js` / `options.css` | The settings page |
| `icons/` | Toolbar icon, a few sizes |

Permissions it asks for, and why:

- `storage` — remembering your API URL and access token between browser
  restarts (`chrome.storage.local`, not synced anywhere).
- `activeTab` — reading the current tab's URL only when you click the
  toolbar icon (a user gesture), not passively.
- `contextMenus` — the right-click "Save this page/link" entries.
- Host access to all sites (`<all_urls>`) — needed to call *your*
  configured API URL, which can be any host; the extension only ever
  requests the URL you set in its options, never anything else.
