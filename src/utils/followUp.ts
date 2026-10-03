// follow_up_at is a date-only string (YYYY-MM-DD) — parsed and
// formatted as UTC so the shown day doesn't shift west of UTC, plus
// whether it's already due (today or earlier), matching the backend sweep's
// own <= today check (app.services.follow_up_reminders) — compared in UTC
// like that check is, not the viewer's own local "today".
export function formatFollowUp(followUpAt: string): { text: string; overdue: boolean } {
  const date = new Date(`${followUpAt}T00:00:00Z`);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    text: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    overdue: date.getTime() <= todayUtc,
  };
}
