import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import "./AdminCommon.css";

function statusStampClass(status: string): string {
  if (status === "success") return "stamp stamp--positive";
  if (status === "failed") return "stamp stamp--negative";
  return "stamp stamp--neutral";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminCrawlSourceJobsPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [page, setPage] = useState(1);

  const jobsQuery = useQuery({
    queryKey: ["admin", "crawl-source-jobs", sourceId, page],
    queryFn: () => adminApi.crawlSourceJobs(sourceId!, page),
    enabled: !!sourceId,
  });
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const data = jobsQuery.data;
  const sourceName = statsQuery.data?.source.name;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="admin-page">
      <Link to={`/admin/crawl-sources/${sourceId}`} className="admin-back-link">
        ‹ Back to source
      </Link>
      <h1>Job Listings · {sourceName ?? "…"}</h1>

      {jobsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {jobsQuery.isError && <p className="admin-page__hint">Couldn't load these listings.</p>}

      {data && (
        <section className="admin-section">
          {data.items.length === 0 && <p className="admin-page__hint">No listings from this source yet.</p>}
          {data.items.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Domain</th>
                  <th>Scan status</th>
                  <th>Discovered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((job) => (
                  <tr key={job.url.id}>
                    <td>{job.posting?.title ?? "—"}</td>
                    <td>{job.posting?.company_name ?? "—"}</td>
                    <td>{job.url.domain}</td>
                    <td>
                      <span className={statusStampClass(job.url.scan_status)}>{job.url.scan_status}</span>
                    </td>
                    <td>{formatDate(job.url.created_at)}</td>
                    <td>
                      <Link to={`/?jobId=${job.url.id}`} className="admin-table__link">
                        View job →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.total > 0 && (
            <div className="admin-pagination">
              <button
                type="button"
                className="rescan-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹ Prev
              </button>
              <span className="admin-pagination__status">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="rescan-button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next ›
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
