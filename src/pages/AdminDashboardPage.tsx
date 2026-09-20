import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import { ScanActivityChart } from "../components/ScanActivityChart";
import type { CrawlSource } from "../api/types";
import "./AdminCommon.css";

type SortKey = "name" | "ats_type" | "status" | "last_crawled_at";
type SortDirection = "asc" | "desc";

const SOURCE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "ats_type", label: "ATS Type" },
  { key: "status", label: "Status" },
  { key: "last_crawled_at", label: "Last crawled" },
];

function compareValues(a: CrawlSource, b: CrawlSource, key: SortKey): number {
  if (key === "last_crawled_at") {
    const aTime = a.last_crawled_at ? new Date(a.last_crawled_at).getTime() : -Infinity;
    const bTime = b.last_crawled_at ? new Date(b.last_crawled_at).getTime() : -Infinity;
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

  const sortedSources = useMemo(() => {
    const sources = sourcesQuery.data ?? [];
    const sorted = [...sources].sort((a, b) => compareValues(a, b, sortKey));
    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [sourcesQuery.data, sortKey, sortDirection]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
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
        <h2 className="admin-section__title">Source List</h2>
        {sourcesQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
        {sourcesQuery.data?.length === 0 && <p className="admin-page__hint">No crawl sources yet.</p>}
        {sourcesQuery.data && sourcesQuery.data.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
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
                {sortedSources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>{source.ats_type ?? "—"}</td>
                    <td>
                      <span className={statusStampClass(source.status)}>{source.status}</span>
                    </td>
                    <td>{formatDate(source.last_crawled_at)}</td>
                    <td>
                      <Link to={`/admin/crawl-sources/${source.id}`} className="admin-table__link">
                        View stats →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
