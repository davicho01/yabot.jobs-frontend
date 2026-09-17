import { api } from "./client";
import { PAGE_SIZE } from "./jobs";
import type { AdminDashboard, CrawlSource, CrawlSourceStats, JobList, ScanDayCount, ScanHourCount } from "./types";

export interface CrawlSourceUpdatePayload {
  name?: string;
  board_url?: string;
  status?: string;
}

export type JobSortKey = "company" | "title" | "status" | "discovered";
export type JobSortOrder = "asc" | "desc";

export const adminApi = {
  dashboard: () => api.get<AdminDashboard>("/admin/dashboard"),
  crawlSources: () => api.get<CrawlSource[]>("/admin/crawl-sources"),
  crawlSourceStats: (sourceId: string) => api.get<CrawlSourceStats>(`/admin/crawl-sources/${sourceId}/stats`),
  jobs: (params: {
    sourceId?: string;
    scanFrom?: string;
    scanTo?: string;
    page?: number;
    pageSize?: number;
    sortBy?: JobSortKey;
    sortOrder?: JobSortOrder;
  }) =>
    api.get<JobList>("/admin/jobs", {
      source_id: params.sourceId,
      scan_from: params.scanFrom,
      scan_to: params.scanTo,
      page: params.page ?? 1,
      page_size: params.pageSize ?? PAGE_SIZE,
      sort_by: params.sortBy ?? "discovered",
      sort_order: params.sortOrder ?? "desc",
    }),
  deleteListing: (urlId: string) => api.delete<void>(`/admin/listings/${urlId}`),
  deleteCrawlSource: (sourceId: string) => api.delete<void>(`/admin/crawl-sources/${sourceId}`),
  updateCrawlSource: (sourceId: string, payload: CrawlSourceUpdatePayload) =>
    api.patch<CrawlSource>(`/admin/crawl-sources/${sourceId}`, payload),
  runCrawlSource: (sourceId: string) => api.post<{ queued: boolean }>(`/admin/crawl-sources/${sourceId}/crawl`),
  rescanCrawlSource: (sourceId: string) => api.post<{ queued: number }>(`/admin/crawl-sources/${sourceId}/rescan`),
  scansByDay: (days = 180) => api.get<ScanDayCount[]>(`/admin/scans-by-day?days=${days}`),
  crawlSourceScansByDay: (sourceId: string, days = 180) =>
    api.get<ScanDayCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-day?days=${days}`),
  scansByHour: (hours = 24) => api.get<ScanHourCount[]>(`/admin/scans-by-hour?hours=${hours}`),
  crawlSourceScansByHour: (sourceId: string, hours = 24) =>
    api.get<ScanHourCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-hour?hours=${hours}`),
};
