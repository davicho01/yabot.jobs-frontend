import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import "./AdminCommon.css";

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
  const dashboard = dashboardQuery.data;

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

      <section className="admin-section">
        <h2 className="admin-section__title">Crawl sources</h2>
        {sourcesQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
        {sourcesQuery.data?.length === 0 && <p className="admin-page__hint">No crawl sources yet.</p>}
        {sourcesQuery.data && sourcesQuery.data.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Last crawled</th>
                <th>Last job count</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sourcesQuery.data.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td>
                    <span className={statusStampClass(source.status)}>{source.status}</span>
                  </td>
                  <td>{formatDate(source.last_crawled_at)}</td>
                  <td>{source.last_job_count ?? "—"}</td>
                  <td>
                    <Link to={`/admin/crawl-sources/${source.id}`} className="admin-table__link">
                      View stats →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
