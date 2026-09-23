import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminPagination } from "../components/AdminPagination";
import { AdminSortMenu } from "../components/AdminSortMenu";
import { AdminWindowStats } from "../components/AdminWindowStats";
import { ScanActivityChart } from "../components/ScanActivityChart";
import type { CrawlSource } from "../api/types";
import "./AdminCommon.css";

const DEFAULT_PAGE_SIZE = 50;

type SortKey = "name" | "ats_type" | "status" | "last_crawled_at" | "coverage_flagged_at";
type SortDirection = "asc" | "desc";

const SOURCE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "ats_type", label: "ATS Type" },
  { key: "status", label: "Status" },
  { key: "last_crawled_at", label: "Last crawled" },
  { key: "coverage_flagged_at", label: "Flagged" },
];

const TEXT_SORT_LABELS = { ascLabel: "A → Z", descLabel: "Z → A" };

const SORT_OPTIONS: { key: SortKey; label: string; ascLabel: string; descLabel: string }[] = [
  { key: "name", label: "Name", ...TEXT_SORT_LABELS },
  { key: "ats_type", label: "ATS type", ...TEXT_SORT_LABELS },
  { key: "status", label: "Status", ...TEXT_SORT_LABELS },
  { key: "last_crawled_at", label: "Last crawled", ascLabel: "Oldest first", descLabel: "Newest first" },
  { key: "coverage_flagged_at", label: "Flagged", ascLabel: "Oldest first", descLabel: "Newest first" },
];

function compareValues(a: CrawlSource, b: CrawlSource, key: SortKey): number {
  if (key === "last_crawled_at" || key === "coverage_flagged_at") {
    const aTime = a[key] ? new Date(a[key] as string).getTime() : -Infinity;
    const bTime = b[key] ? new Date(b[key] as string).getTime() : -Infinity;
    return aTime - bTime;
  }
  const aValue = (a[key] ?? "").toString().toLowerCase();
  const bValue = (b[key] ?? "").toString().toLowerCase();
  return aValue.localeCompare(bValue);
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusStampClass(status: string): string {
  if (status === "active") return "stamp stamp--positive";
  if (status === "rejected") return "stamp stamp--negative";
  return "stamp stamp--neutral";
}

export function AdminDashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ["admin", "dashboard"], queryFn: adminApi.dashboard });
  const sourcesQuery = useQuery({ queryKey: ["admin", "crawl-sources"], queryFn: adminApi.crawlSources });
  const scansByDayQuery = useQuery({ queryKey: ["admin", "scans-by-day"], queryFn: () => adminApi.scansByDay(180) });
  const scansByHourQuery = useQuery({ queryKey: ["admin", "scans-by-hour"], queryFn: () => adminApi.scansByHour(24) });
  const dashboard = dashboardQuery.data;

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Search/page/page size live in the URL (not component state) so a refresh,
  // or sharing the link, reproduces the same view — same as the job listings
  // page. The full source list is already loaded, so this is all client-side.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const flaggedOnly = searchParams.get("flagged") === "1";
  const requestedPage = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          update(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sortedSources = useMemo(() => {
    const sources = sourcesQuery.data ?? [];
    const sorted = [...sources].sort((a, b) => compareValues(a, b, sortKey));
    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [sourcesQuery.data, sortKey, sortDirection]);

  const filteredSources = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortedSources.filter((source) => {
      if (flaggedOnly && !source.coverage_flagged_at) return false;
      if (needle && !source.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sortedSources, search, flaggedOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredSources.length / pageSize));
  // Clamped so a stale ?page= (e.g. after a narrower search) shows the last
  // page rather than an empty one.
  const page = Math.min(requestedPage, totalPages);
  const pageSources = filteredSources.slice((page - 1) * pageSize, page * pageSize);

  function goToPage(target: number) {
    updateParams((next) => {
      if (target <= 1) next.delete("page");
      else next.set("page", String(target));
    });
  }

  function toggleFlaggedOnly() {
    updateParams((next) => {
      if (flaggedOnly) next.delete("flagged");
      else next.set("flagged", "1");
      next.delete("page");
    });
  }

  function handleSearchChange(value: string) {
    updateParams((next) => {
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
    });
  }

  function handleSortChange(key: SortKey, direction: SortDirection) {
    setSortKey(key);
    setSortDirection(direction);
    updateParams((next) => next.delete("page"));
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    updateParams((next) => next.delete("page"));
  }

  return (
    <main className="admin-page">
      <h1>Admin dashboard</h1>

      {dashboardQuery.isLoading && <p className="admin-page__hint">Loading…</p>}

      {dashboard && (
        <>
          <section className="admin-totals">
            <div className="admin-totals__tile">
              <span className="admin-totals__value">{dashboard.totals.job_listings.toLocaleString()}</span>
              <span className="admin-totals__label">Job listings</span>
            </div>
            <div className="admin-totals__tile">
              <span className="admin-totals__value">{dashboard.totals.crawl_sources.toLocaleString()}</span>
              <span className="admin-totals__label">Crawl sources</span>
            </div>
            <button
              type="button"
              className="admin-totals__tile admin-totals__tile--button"
              onClick={toggleFlaggedOnly}
              disabled={dashboard.totals.crawl_sources_flagged === 0 && !flaggedOnly}
              aria-pressed={flaggedOnly}
            >
              <span
                className="admin-totals__value"
                style={dashboard.totals.crawl_sources_flagged > 0 ? { color: "var(--amber)" } : undefined}
              >
                {dashboard.totals.crawl_sources_flagged.toLocaleString()}
              </span>
              <span className="admin-totals__label">
                Sources flagged{flaggedOnly ? " (showing)" : dashboard.totals.crawl_sources_flagged > 0 ? " →" : ""}
              </span>
            </button>
            <div className="admin-totals__tile">
              <span className="admin-totals__value">{dashboard.totals.users.toLocaleString()}</span>
              <span className="admin-totals__label">Users</span>
            </div>
          </section>

          <section className="admin-section">
            <AdminWindowStats title="Users joined" counts={dashboard.users_joined} />
            <AdminWindowStats title="User activity" counts={dashboard.user_activity} />
            <AdminWindowStats title="Application scans" counts={dashboard.application_scans} />
          </section>
        </>
      )}

      <ScanActivityChart
        title="Listings scanned"
        data={scansByDayQuery.data}
        isLoading={scansByDayQuery.isLoading}
        hourlyData={scansByHourQuery.data}
        isHourlyLoading={scansByHourQuery.isLoading}
      />

      <section className="admin-section">
        <div className="admin-section__header">
          <h2 className="admin-section__title">Source List</h2>
          <div className="admin-toolbar">
            {flaggedOnly && (
              <button type="button" className="stamp stamp--warning" onClick={toggleFlaggedOnly}>
                Flagged only ✕
              </button>
            )}
            <input
              type="search"
              className="admin-source-search"
              placeholder="Search by name…"
              aria-label="Search sources by name"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <AdminSortMenu
              options={SORT_OPTIONS}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onChange={handleSortChange}
            />
          </div>
        </div>
        {sourcesQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
        {sourcesQuery.data?.length === 0 && <p className="admin-page__hint">No crawl sources yet.</p>}
        {sourcesQuery.data && sourcesQuery.data.length > 0 && filteredSources.length === 0 && (
          <p className="admin-page__hint">
            {search.trim() ? `No sources match “${search.trim()}”.` : "No flagged sources."}
          </p>
        )}
        {filteredSources.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--sources">
              <thead>
                <tr>
                  {SOURCE_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className="admin-table__th--sortable"
                      onClick={() => handleSort(column.key)}
                    >
                      {column.label}
                      {sortKey === column.key && (
                        <span className="admin-table__sort-indicator">
                          {sortDirection === "asc" ? " ▲" : " ▼"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageSources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      {source.name}
                      {/* Phones drop the ATS/last-crawled/flagged columns (see AdminCommon.css) — this keeps that info, compactly, under the name. */}
                      <span className="admin-table__sub">
                        {source.ats_type ?? "—"} · {formatDate(source.last_crawled_at)}
                        {source.coverage_flagged_at && (
                          <span className="admin-table__sub-flagged"> · Flagged</span>
                        )}
                      </span>
                    </td>
                    <td>{source.ats_type ?? "—"}</td>
                    <td>
                      <span className={statusStampClass(source.status)}>{source.status}</span>
                    </td>
                    <td>{formatDate(source.last_crawled_at)}</td>
                    <td>
                      {source.coverage_flagged_at ? (
                        <span className="stamp stamp--warning" title={`Flagged since ${formatDate(source.coverage_flagged_at)}`}>
                          {formatDate(source.coverage_flagged_at)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link to={`/admin/crawl-sources/${source.id}`} className="admin-table__link">
                        <span className="admin-table__link-label">View stats </span>→
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredSources.length > 0 && (
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={filteredSources.length}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={(newSize) =>
              updateParams((next) => {
                if (newSize === DEFAULT_PAGE_SIZE) next.delete("pageSize");
                else next.set("pageSize", String(newSize));
                next.delete("page");
              })
            }
          />
        )}
      </section>
    </main>
  );
}
