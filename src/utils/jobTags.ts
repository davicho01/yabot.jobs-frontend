// Display labels for a posting's workplace/employment type (the backend's
// WorkplaceType/EmploymentType enums, app.models.enums). "unknown" — and
// anything unrecognized — maps to null so callers just leave the tag out
// rather than showing an "unknown" chip.
export const WORKPLACE_LABELS: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

export function workplaceLabel(value: string | null | undefined): string | null {
  return value ? (WORKPLACE_LABELS[value] ?? null) : null;
}

export function employmentLabel(value: string | null | undefined): string | null {
  return value ? (EMPLOYMENT_LABELS[value] ?? null) : null;
}
