import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import type { CrawlSource } from "../api/types";
import { AdminWindowStats } from "../components/AdminWindowStats";
import { ScanActivityChart } from "../components/ScanActivityChart";
import { useConfirm } from "../components/ConfirmDialog";
import "./AdminCommon.css";

const CRAWL_SOURCE_STATUSES = ["pending", "active", "rejected", "delete"];

function EditCrawlSourceDialog({ source, onClose }: { source: CrawlSource; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(source.name);
  const [boardUrl, setBoardUrl] = useState(source.board_url);
  const [sourceStatus, setSourceStatus] = useState(source.status);

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateCrawlSource(source.id, { name, board_url: boardUrl, status: sourceStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crawl-source-stats", source.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "crawl-sources"] });
      onClose();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate();
  }

  return (
    <div className="confirm-dialog__overlay" onClick={onClose}>
      <div
        className="confirm-dialog edit-crawl-source-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">Edit crawl source</h2>
        <form onSubmit={handleSubmit} className="edit-crawl-source-dialog__form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Board URL
            <input value={boardUrl} onChange={(e) => setBoardUrl(e.target.value)} required />
          </label>
          <label>
            Status
            <div className="select-field">
              <select value={sourceStatus} onChange={(e) => setSourceStatus(e.target.value)}>
                {CRAWL_SOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </label>
          {updateMutation.isError && (
            <p className="admin-source-header__error">
              {updateMutation.error instanceof ApiError ? updateMutation.error.message : "Couldn't save changes."}
            </p>
          )}
          <div className="confirm-dialog__actions">
            <button type="button" className="confirm-dialog__button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="confirm-dialog__button confirm-dialog__button--primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [isEditing, setIsEditing] = useState(false);
  const scansByDayQuery = useQuery({
    queryKey: ["admin", "crawl-source-scans-by-day", sourceId],
    queryFn: () => adminApi.crawlSourceScansByDay(sourceId!, 180),
    enabled: !!sourceId,
  });
  const scansByHourQuery = useQuery({
    queryKey: ["admin", "crawl-source-scans-by-hour", sourceId],
    queryFn: () => adminApi.crawlSourceScansByHour(sourceId!, 24),
    enabled: !!sourceId,
  });

  const deleteSourceMutation = useMutation({
    mutationFn: () => adminApi.deleteCrawlSource(sourceId!),
    onSuccess: () => navigate("/admin"),
  });

  const runCrawlMutation = useMutation({
    mutationFn: () => adminApi.runCrawlSource(sourceId!),
  });

  const rescanMutation = useMutation({
    mutationFn: () => adminApi.rescanCrawlSource(sourceId!),
  });

  async function deleteSource() {
    if (await confirm("Permanently delete this crawl source? This can't be undone.")) {
      deleteSourceMutation.mutate();
    }
  }

  return (
    <main className="admin-page">
      {dialog}
      {isEditing && stats && (
        <EditCrawlSourceDialog source={stats.source} onClose={() => setIsEditing(false)} />
      )}
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
            {stats.source.coverage_flagged_at && (
              <p className="admin-source-header__warning">
                Coverage dropped: last crawl found {stats.source.coverage_last_count ?? "?"} URL(s), well below the
                usual ~{Math.round(stats.source.coverage_baseline ?? 0)} — flagged since{" "}
                {formatDate(stats.source.coverage_flagged_at)}.
              </p>
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
            <div className="admin-section__footer">
              <button type="button" className="rescan-button" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <div className="admin-section__footer-actions">
                {rescanMutation.isSuccess && <p className="admin-page__hint">Rescan queued.</p>}
                {rescanMutation.isError && <p className="admin-source-header__error">Couldn't queue a rescan.</p>}
                {runCrawlMutation.isSuccess && <p className="admin-page__hint">Crawl queued.</p>}
                {runCrawlMutation.isError && <p className="admin-source-header__error">Couldn't queue a crawl.</p>}
                <Link
                  to={`/admin/jobs?sourceId=${sourceId}`}
                  className="rescan-button"
                >
                  View jobs
                </Link>
                <button
                  type="button"
                  className="rescan-button"
                  disabled={rescanMutation.isPending}
                  onClick={() => rescanMutation.mutate()}
                >
                  {rescanMutation.isPending ? "Queuing…" : "Rescan postings"}
                </button>
                <button
                  type="button"
                  className="rescan-button"
                  disabled={stats.source.status !== "active" || runCrawlMutation.isPending}
                  onClick={() => runCrawlMutation.mutate()}
                >
                  {runCrawlMutation.isPending ? "Queuing…" : "Run crawl"}
                </button>
              </div>
            </div>
          </section>

          <ScanActivityChart
            title="Listings scanned"
            data={scansByDayQuery.data}
            isLoading={scansByDayQuery.isLoading}
            hourlyData={scansByHourQuery.data}
            isHourlyLoading={scansByHourQuery.isLoading}
            sourceId={sourceId}
          />

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
