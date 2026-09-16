import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import { ScanActivityChart } from "../components/ScanActivityChart";
import { useConfirm } from "../components/ConfirmDialog";
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
  const navigate = useNavigate();
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const stats = statsQuery.data;
  const { confirm, dialog } = useConfirm();
  const scansByDayQuery = useQuery({
    queryKey: ["admin", "crawl-source-scans-by-day", sourceId],
    queryFn: () => adminApi.crawlSourceScansByDay(sourceId!, 180),
    enabled: !!sourceId,
  });

  const deleteSourceMutation = useMutation({
    mutationFn: () => adminApi.deleteCrawlSource(sourceId!),
    onSuccess: () => navigate("/admin"),
  });

  async function deleteSource() {
    if (await confirm("Permanently delete this crawl source? This can't be undone.")) {
      deleteSourceMutation.mutate();
    }
  }

  return (
    <main className="admin-page admin-page--source-stats">
      {dialog}
      <Link to="/admin" className="admin-back-link">
        ‹ Back to dashboard
      </Link>

      {statsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {statsQuery.isError && <p className="admin-page__hint">Couldn't load this source.</p>}

      {stats && (
        <>
          <div className="admin-source-header">
            <div className="admin-source-header__row">
              <h1>{stats.source.name}</h1>
              <div className="admin-source-header__total">
                <span className="admin-totals__value">{stats.total_listings.toLocaleString()}</span>
                <span className="admin-totals__label">Total listings</span>
              </div>
            </div>
            {stats.source.last_error && (
              <p className="admin-source-header__error">Last crawl error: {stats.source.last_error}</p>
            )}
          </div>

          <section className="admin-section">
            <div className="admin-section__header">
              <h2 className="admin-section__title">Source details</h2>
              <div className="admin-section__header-row">
                <span className={statusStampClass(stats.source.status)}>{stats.source.status}</span>
              </div>
            </div>
            <dl className="admin-detail-grid">
              <div className="admin-detail-grid__item">
                <dt>URL</dt>
                <dd>
                  <a href={stats.source.board_url} target="_blank" rel="noopener noreferrer" title={stats.source.board_url}>
                    {stats.source.board_url}
                  </a>
                </dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>ATS type</dt>
                <dd>{stats.source.ats_type ?? "Unrecognized platform"}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Last crawled</dt>
                <dd>{formatDate(stats.source.last_crawled_at)}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Created</dt>
                <dd>{formatDate(stats.source.created_at)}</dd>
              </div>
            </dl>
          </section>

          <ScanActivityChart title="Listings scanned" data={scansByDayQuery.data} isLoading={scansByDayQuery.isLoading} />

          <section className="admin-section">
            <AdminWindowStats title="Listings added" counts={stats.listings_added} />
            <AdminWindowStats title="Scans" counts={stats.scans} />
          </section>

          <section className="admin-section admin-danger-zone">
            <h2 className="admin-section__title">Danger zone</h2>
            <div className="admin-danger-zone__row">
              <p className="admin-danger-zone__description">
                Permanently delete this crawl source. This can't be undone.
              </p>
              <button
                type="button"
                className="rescan-button rescan-button--danger"
                disabled={deleteSourceMutation.isPending}
                onClick={deleteSource}
              >
                {deleteSourceMutation.isPending ? "Deleting…" : "Delete source"}
              </button>
            </div>
            {deleteSourceMutation.isError && (
              <p className="admin-source-header__error">Couldn't delete this source.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
