import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import "./AdminCommon.css";

function statusStampClass(status: string): string {
  if (status === "active") return "stamp stamp--positive";
  if (status === "rejected") return "stamp stamp--negative";
  return "stamp stamp--neutral";
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminCrawlSourceStatsPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const stats = statsQuery.data;

  return (
    <main className="admin-page admin-page--source-stats">
      <Link to="/admin" className="admin-back-link">
        ‹ Back to dashboard
      </Link>

      {statsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {statsQuery.isError && <p className="admin-page__hint">Couldn't load this source.</p>}

      {stats && (
        <>
          <div className="admin-source-header">
            <h1>{stats.source.name}</h1>
            {stats.source.last_error && (
              <p className="admin-source-header__error">Last crawl error: {stats.source.last_error}</p>
            )}
          </div>

          <section className="admin-section">
            <div className="admin-section__header">
              <h2 className="admin-section__title">Source details</h2>
              <div className="admin-section__header-row">
                <a href={stats.source.board_url} target="_blank" rel="noopener noreferrer" title={stats.source.board_url}>
                  {stats.source.board_url}
                </a>
                <span className={statusStampClass(stats.source.status)}>{stats.source.status}</span>
              </div>
            </div>
            <dl className="admin-detail-grid">
              <div className="admin-detail-grid__item">
                <dt>ATS type</dt>
                <dd>{stats.source.ats_type ?? "Unrecognized platform"}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Active</dt>
                <dd>{stats.source.is_active ? "Yes" : "No"}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Last crawled</dt>
                <dd>{formatDate(stats.source.last_crawled_at)}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Last job count</dt>
                <dd>{stats.source.last_job_count?.toLocaleString() ?? "—"}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Created</dt>
                <dd>{formatDate(stats.source.created_at)}</dd>
              </div>
            </dl>
          </section>

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
