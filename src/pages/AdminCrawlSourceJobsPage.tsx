import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { jobsApi } from "../api/jobs";
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

  const rescanMutation = useMutation({
    mutationFn: () => adminApi.rescanCrawlSource(sourceId!),
  });

  const queryClient = useQueryClient();
  const rescanListingMutation = useMutation({
    mutationFn: (urlId: string) => jobsApi.rescan(urlId),
    onSuccess: (_data, urlId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crawl-source-jobs", sourceId] });
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
    },
  });

  return (
    <main className="admin-page">
      <Link to={`/admin/crawl-sources/${sourceId}`} className="admin-back-link">
        ‹ Back to source
      </Link>
      <div className="admin-section__header">
        <h1>Job Listings · {sourceName ?? "…"}</h1>
        <div className="admin-section__header-row">
          {rescanMutation.isSuccess && <p className="admin-page__hint">Rescan queued.</p>}
          {rescanMutation.isError && <p className="admin-source-header__error">Couldn't queue a rescan.</p>}
          <button
            type="button"
            className="rescan-button"
            disabled={rescanMutation.isPending}
            onClick={() => rescanMutation.mutate()}
          >
            {rescanMutation.isPending ? "Queuing…" : "Rescan postings"}
          </button>
        </div>
      </div>

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
                {data.items.map((job) => {
                  const isRescanning =
                    rescanListingMutation.isPending && rescanListingMutation.variables === job.url.id;
                  const rescanFailed =
                    rescanListingMutation.isError && rescanListingMutation.variables === job.url.id;
                  return (
                    <tr key={job.url.id}>
                      <td>{job.posting?.title ?? "—"}</td>
                      <td>{job.posting?.company_name ?? "—"}</td>
                      <td>{job.url.domain}</td>
                      <td>
                        <span className={statusStampClass(job.url.scan_status)}>{job.url.scan_status}</span>
                        {rescanFailed && <p className="rescan-error">Rescan failed.</p>}
                      </td>
                      <td>{formatDate(job.url.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="rescan-button"
                          disabled={isRescanning}
                          onClick={() => rescanListingMutation.mutate(job.url.id)}
                        >
                          {isRescanning ? "Rescanning…" : "Rescan ↻"}
                        </button>
                        <Link to={`/?jobId=${job.url.id}`} className="admin-table__link">
                          View job →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
