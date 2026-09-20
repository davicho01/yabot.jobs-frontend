import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { jobsApi } from "../api/jobs";
import { AdminPagination } from "../components/AdminPagination";
import type { JobSortKey } from "../api/admin";
import "./AdminCommon.css";

const DEFAULT_PAGE_SIZE = 50;

type SortDirection = "asc" | "desc";

const JOB_COLUMNS: { key: JobSortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "discovered", label: "Scanned" },
];

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

export function AdminJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const scanFrom = searchParams.get("scanFrom") ?? undefined;
  const scanTo = searchParams.get("scanTo") ?? undefined;

  // Page/size/sort live in the URL (not component state) so a refresh, or
  // sharing the link, reproduces exactly the same table view.
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const sortKey = (searchParams.get("sortKey") as JobSortKey | null) ?? "discovered";
  const sortDirection = (searchParams.get("sortDirection") as SortDirection | null) ?? "desc";

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

  const jobsQuery = useQuery({
    queryKey: ["admin", "jobs", sourceId, scanFrom, scanTo, page, pageSize, sortKey, sortDirection],
    queryFn: () =>
      adminApi.jobs({ sourceId, scanFrom, scanTo, page, pageSize, sortBy: sortKey, sortOrder: sortDirection }),
  });
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const data = jobsQuery.data;
  const sourceName = statsQuery.data?.source.name;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || pageSize))) : 1;

  function handleSort(key: JobSortKey) {
    updateParams((next) => {
      const newDirection = key === sortKey && sortDirection === "asc" ? "desc" : "asc";
      if (key === "discovered") next.delete("sortKey");
      else next.set("sortKey", key);
      if (newDirection === "desc") next.delete("sortDirection");
      else next.set("sortDirection", newDirection);
      next.delete("page");
    });
  }

  const rescanMutation = useMutation({
    mutationFn: () => adminApi.rescanCrawlSource(sourceId!),
  });

  const queryClient = useQueryClient();
  const rescanListingMutation = useMutation({
    mutationFn: (urlId: string) => jobsApi.rescan(urlId),
    onSuccess: (_data, urlId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
    },
  });

  const goToPage = (target: number) => {
    const clamped = Math.min(totalPages, Math.max(1, target));
    updateParams((next) => {
      if (clamped <= 1) next.delete("page");
      else next.set("page", String(clamped));
    });
  };

  return (
    <main className="admin-page">
      {sourceId && (
        <Link to={`/admin/crawl-sources/${sourceId}`} className="admin-back-link">
          ‹ Back to source
        </Link>
      )}
      <div className="admin-section__header">
        <h1>Job Listings{sourceId ? ` · ${sourceName ?? "…"}` : ""}</h1>
        {(scanFrom || scanTo) && (
          <p className="admin-page__hint">
            Scanned {scanFrom ? formatDate(scanFrom) : "…"} – {scanTo ? formatDate(scanTo) : "…"}
          </p>
        )}
        {sourceId && (
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
        )}
      </div>

      {jobsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {jobsQuery.isError && <p className="admin-page__hint">Couldn't load these listings.</p>}

      {data && (
        <section className="admin-section">
          {data.items.length === 0 && <p className="admin-page__hint">No listings match these filters.</p>}
          {data.items.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {JOB_COLUMNS.map((column) => (
                      <th key={column.key} className="admin-table__th--sortable" onClick={() => handleSort(column.key)}>
                        {column.label}
                        {sortKey === column.key && (
                          <span className="admin-table__sort-indicator">{sortDirection === "asc" ? " ▲" : " ▼"}</span>
                        )}
                      </th>
                    ))}
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
                        <td>
                          {job.posting?.company_name && job.url.crawl_source_id ? (
                            <Link to={`/admin/crawl-sources/${job.url.crawl_source_id}`}>
                              {job.posting.company_name}
                            </Link>
                          ) : (
                            (job.posting?.company_name ?? "—")
                          )}
                        </td>
                        <td>{job.posting?.title ?? "—"}</td>
                        <td>
                          <span className={statusStampClass(job.url.scan_status)}>{job.url.scan_status}</span>
                          {rescanFailed && <p className="rescan-error">Rescan failed.</p>}
                        </td>
                        <td className="admin-table__nowrap">{formatDate(job.url.created_at)}</td>
                        <td>
                          <div className="admin-table__actions">
                            <button
                              type="button"
                              className="rescan-button"
                              disabled={isRescanning}
                              onClick={() => rescanListingMutation.mutate(job.url.id)}
                            >
                              {isRescanning ? "Rescanning…" : "Rescan ↻"}
                            </button>
                            <Link to={`/jobs/${job.url.id}`} className="rescan-button">
                              View job
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.total > 0 && (
            <AdminPagination
              page={page}
              totalPages={totalPages}
              total={data.total}
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
      )}
    </main>
  );
}
