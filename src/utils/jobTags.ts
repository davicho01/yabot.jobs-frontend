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

// The board shows Engineering & Technology unless its URL says otherwise:
// no ?sector= means this default, ?sector=all means every sector. The API
// itself has no default (no sector param there = every sector), so this
// lives only here.
export const DEFAULT_SECTOR = "engineering_tech";
export const ALL_SECTORS = "all";

// Shorter names for the search pill's sector dropdown, where space is tight
// — everywhere else (a job's details, saved-search names) keeps the full
// SECTOR_LABELS. Customer Support, Design & Product and Trades & Service stay
// long on purpose: "Support" reads as IT, "Design" hides product managers,
// and the trades bucket also holds retail and hospitality.
export const SECTOR_SHORT_LABELS: Record<string, string> = {
  engineering_tech: "Tech",
  engineering_traditional: "Engineering",
  sales: "Sales",
  marketing: "Marketing",
  finance_accounting: "Finance",
  hr: "HR",
  operations_manufacturing: "Operations",
  customer_support: "Customer Support",
  legal: "Legal",
  healthcare: "Healthcare",
  design_product: "Design & Product",
  executive: "Executive",
  administrative_office: "Admin",
  service_trades: "Trades & Service",
};

export const SECTOR_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_SECTORS, label: "All sectors" },
  { value: DEFAULT_SECTOR, label: SECTOR_SHORT_LABELS[DEFAULT_SECTOR] },
  ...Object.entries(SECTOR_SHORT_LABELS)
    .filter(([value]) => value !== DEFAULT_SECTOR)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label })),
];

// The sector a board URL searches, as the API's sector param: undefined for
// "all", the default when the param is missing or isn't a known sector.
export function boardSector(params: URLSearchParams): string | undefined {
  const sector = params.get("sector");
  if (sector === ALL_SECTORS) return undefined;
  return sector && sector in SECTOR_LABELS ? sector : DEFAULT_SECTOR;
}
