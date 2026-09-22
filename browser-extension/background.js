import { isSaveableUrl, saveJobUrl } from "./common.js";

// Right-click on a page, or on a link, to save it without opening the
// popup — handy for saving a listing straight from a search results page
// without navigating to it first.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-yabot",
    title: "Save this page to Yabot Jobs",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "save-link-to-yabot",
    title: "Save this link to Yabot Jobs",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const url = info.menuItemId === "save-link-to-yabot" ? info.linkUrl : info.pageUrl;
  if (!isSaveableUrl(url)) return;

  try {
    await saveJobUrl(url);
    flashBadge("✓", "#248a3d");
  } catch (err) {
    flashBadge("!", "#d70015");
    console.error("[Yabot Jobs] save failed:", err);
  }
});

// The toolbar icon has no badge normally — this is only ever a brief
// confirmation after a context-menu save (the popup shows its own status
// inline instead, since it stays open long enough to read).
function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}
