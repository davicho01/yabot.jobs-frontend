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

// Mirrors the backend's _SECTOR_INFO (app.services.static_pages) — the job
// function/department a posting is hiring for. "unknown" has no display
// name there either (it's not a real category), so it maps to null here too.
const SECTOR_LABELS: Record<string, string> = {
  engineering_tech: "Engineering & Technology",
  engineering_traditional: "Traditional Engineering",
  sales: "Sales",
  marketing: "Marketing",
  finance_accounting: "Finance & Accounting",
  hr: "Human Resources",
  operations_manufacturing: "Operations & Manufacturing",
  customer_support: "Customer Support",
  legal: "Legal",
  healthcare: "Healthcare",
  design_product: "Design & Product",
  executive: "Executive",
  administrative_office: "Administrative & Office",
  service_trades: "Service & Trades",
};

export function sectorLabel(value: string | null | undefined): string | null {
  return value ? (SECTOR_LABELS[value] ?? null) : null;
}
