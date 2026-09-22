import { getConfig, isSaveableUrl, saveJobUrl } from "./common.js";

const notConfiguredEl = document.getElementById("not-configured");
const configuredEl = document.getElementById("configured");
const currentUrlEl = document.getElementById("current-url");
const saveButton = document.getElementById("save-button");
const statusEl = document.getElementById("status");

document.getElementById("options-link").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
  statusEl.className = `popup__status${kind ? ` popup__status--${kind}` : ""}`;
}

async function init() {
  const { apiBaseUrl, token } = await getConfig();
  if (!apiBaseUrl || !token) {
    notConfiguredEl.hidden = false;
    return;
  }
  configuredEl.hidden = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";

  if (!isSaveableUrl(url)) {
    currentUrlEl.textContent = "This page can't be saved.";
    saveButton.disabled = true;
    return;
  }
  currentUrlEl.textContent = url;

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    setStatus("Saving…");
    try {
      await saveJobUrl(url);
      setStatus("Saved to your board ✓", "ok");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't save this posting.", "error");
      saveButton.disabled = false;
    }
  });
}

init();
