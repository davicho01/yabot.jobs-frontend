import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminPagination } from "../components/AdminPagination";
import type { AdminSearchOpportunity, SearchKind } from "../api/types";

const DEFAULT_PAGE_SIZE = 50;
// A role page needs this many open jobs to be proposed (collection_qualification.THRESHOLDS.min_jobs).
const MIN_JOBS = 20;

const KINDS: { value: SearchKind | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "role", label: "Roles" },
  { value: "location", label: "Places" },
  { value: "company", label: "Companies" },
  { value: "other", label: "Other" },
];

const KIND_LABELS: Record<SearchKind, string> = {
  role: "Role",
  location: "Place",
  company: "Company",
  other: "Other",
};

function formatDay(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Whether a page answers the search: the role page's status, or why there's none.
function PageCell({ item }: { item: AdminSearchOpportunity }) {
  if (item.kind !== "role") return <span className="admin-table__sub">—</span>;
  if (item.collection_status && item.collection_key) {
    return (
      <Link to={`/admin/collections?view=all&q=${encodeURIComponent(item.collection_key)}`}>
        <span className="stamp stamp--neutral">{item.collection_status}</span>
      </Link>
    );
  }
  if ((item.open_jobs ?? 0) < MIN_JOBS) return <span className="admin-table__sub">Too few jobs</span>;
  return <span className="admin-table__sub">Not proposed yet</span>;
}

// What people searched on Google when the site showed up, last 28 days,
// grouped by what they were after (the backend's search_opportunities).
// Refreshed each weeknight. A role search shows the page that answers it.
export function AdminCollectionSearches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = (searchParams.get("kind") ?? "") as SearchKind | "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;

  const update = (change: (next: URLSearchParams) => void) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      change(next);
      return next;
    });

  const listQuery = useQuery({
    queryKey: ["admin", "collection-searches", kind, page, pageSize],
    queryFn: () => adminApi.collectionSearches({ kind: kind || undefined, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const data = listQuery.data;
  const counts = data?.counts ?? {};
  const countFor = (value: SearchKind | "") =>
    value ? (counts[value] ?? 0) : Object.values(counts).reduce((sum, n) => sum + n, 0);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const items = data?.items ?? [];

  return (
    <>
      <p className="admin-page__hint">
        What people searched on Google when the site showed up, over the last 28 days, grouped by what they
        were after{data?.updated_on ? ` (updated ${formatDay(data.updated_on)})` : ""}. Role searches people
        make go first in the nightly proposals. Google leaves out searches too rare to show.
      </p>
      <div className="admin-toolbar admin-feedback__toolbar">
        <div className="admin-feedback__tabs" role="group" aria-label="Kind">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={kind === option.value}
              className={kind === option.value ? "is-active" : ""}
              onClick={() =>
                update((next) => {
                  if (option.value) next.set("kind", option.value);
                  else next.delete("kind");
                  next.delete("page");
                })
              }
            >
              {option.label} {data ? <span className="admin-collections__count">{countFor(option.value)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {listQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {listQuery.isError && <p className="admin-page__hint">Couldn't load the searches.</p>}
      {data && items.length === 0 && <p className="admin-page__hint">Nothing here yet: searches import each weeknight.</p>}

      {items.length > 0 && (
        <>
          <div className="admin-section admin-table-wrap">
            <table className="admin-table admin-collections__table">
              <thead>
                <tr>
                  <th>Searched for</th>
                  <th>Kind</th>
                  <th title="Times the site was shown in Google for these searches">Shown</th>
                  <th>Clicks</th>
                  <th title="Average position in Google, 1 = top">Position</th>
                  <th>Open jobs</th>
                  <th title="The role page that answers it">Page</th>
                  <th>Google showed</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <strong>{item.label}</strong>
                      <div className="admin-table__sub">
                        {item.queries
                          .slice(0, 3)
                          .map((q) => `“${q.query}”`)
                          .join(", ")}
                        {item.queries.length > 3 ? ` +${item.queries.length - 3}` : ""}
                      </div>
                    </td>
                    <td>{KIND_LABELS[item.kind]}</td>
                    <td>{item.impressions.toLocaleString()}</td>
                    <td>{item.clicks.toLocaleString()}</td>
                    <td>{item.position.toFixed(1)}</td>
                    <td>{item.open_jobs?.toLocaleString() ?? "—"}</td>
                    <td>
                      <PageCell item={item} />
                    </td>
                    <td className="admin-table__sub">{item.pages[0]?.page ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={data?.total ?? 0}
            pageSize={pageSize}
            onPageChange={(target) => update((next) => next.set("page", String(target)))}
            onPageSizeChange={(size) =>
              update((next) => {
                next.set("pageSize", String(size));
                next.delete("page");
              })
            }
          />
        </>
      )}
    </>
  );
}
