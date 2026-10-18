// Small line icons for the navigation pills (the job board's "All jobs" and
// "My applications", the apply page's way back). They draw in currentColor
// so they take the pill's text color.

export function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="2.5" cy="4" r="1.2" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <rect x="1.5" y="4.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M1.5 8.5h13" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
