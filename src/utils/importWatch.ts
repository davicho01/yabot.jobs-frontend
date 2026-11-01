// Jobs the candidate asked to be told about once their import finishes. Kept
// in sessionStorage (so a reload of the tab keeps watching) and read by
// ImportWatcher, which lives above the pages so it keeps working after the
// candidate navigates away from the waiting page.
const KEY = "yabot:import-watch";
export const IMPORT_WATCH_EVENT = "yabot:import-watch-changed";

export function getImportWatches(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode quota etc.): watching just won't survive a reload.
  }
  window.dispatchEvent(new Event(IMPORT_WATCH_EVENT));
}

export function addImportWatch(urlId: string) {
  const ids = getImportWatches();
  if (!ids.includes(urlId)) save([...ids, urlId]);
}

export function removeImportWatch(urlId: string) {
  const ids = getImportWatches();
  if (ids.includes(urlId)) save(ids.filter((id) => id !== urlId));
}
