import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import "./AdminCommon.css";

export function AdminCrawlSourceStatsPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const stats = statsQuery.data;

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ‹ Back to dashboard
      </Link>

      {statsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {statsQuery.isError && <p className="admin-page__hint">Couldn't load this source.</p>}

      {stats && (
        <>
          <div className="admin-source-header">
            <h1>{stats.source.name}</h1>
            <p className="admin-source-header__meta">
              {stats.source.ats_type ?? "Unrecognized platform"}
              {stats.source.board_token ? ` · ${stats.source.board_token}` : ""}
              {" · "}
              <span className="stamp stamp--neutral">{stats.source.status}</span>
            </p>
            {stats.source.last_error && (
              <p className="admin-source-header__error">Last crawl error: {stats.source.last_error}</p>
            )}
          </div>

          <section className="admin-totals">
            <div className="admin-totals__tile">
              <span className="admin-totals__value">{stats.total_listings.toLocaleString()}</span>
              <span className="admin-totals__label">Total listings</span>
            </div>
          </section>

          <section className="admin-section">
            <AdminWindowStats title="Listings added" counts={stats.listings_added} />
            <AdminWindowStats title="Scans" counts={stats.scans} />
          </section>
        </>
      )}
    </main>
  );
}
