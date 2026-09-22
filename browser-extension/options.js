import { getConfig, setConfig, whoAmI } from "./common.js";

const apiBaseUrlInput = document.getElementById("api-base-url");
const tokenInput = document.getElementById("token");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
  statusEl.className = `options__status${kind ? ` options__status--${kind}` : ""}`;
}

async function load() {
  const { apiBaseUrl, token } = await getConfig();
  apiBaseUrlInput.value = apiBaseUrl;
  tokenInput.value = token;
}

async function save() {
  await setConfig({ apiBaseUrl: apiBaseUrlInput.value.trim(), token: tokenInput.value.trim() });
}

document.getElementById("save").addEventListener("click", async () => {
  await save();
  setStatus("Saved.", "ok");
});

document.getElementById("test").addEventListener("click", async () => {
  await save();
  setStatus("Testing…");
  try {
    const me = await whoAmI();
    setStatus(`Connected as ${me.email}`, "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Couldn't connect.", "error");
  }
});

load();
