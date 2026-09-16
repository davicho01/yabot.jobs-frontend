import { api } from "./client";
import type { AdminDashboard, CrawlSource, CrawlSourceStats, ScanDayCount } from "./types";

export interface CrawlSourceUpdatePayload {
  name?: string;
  board_url?: string;
  status?: string;
}

export const adminApi = {
  dashboard: () => api.get<AdminDashboard>("/admin/dashboard"),
  crawlSources: () => api.get<CrawlSource[]>("/admin/crawl-sources"),
  crawlSourceStats: (sourceId: string) => api.get<CrawlSourceStats>(`/admin/crawl-sources/${sourceId}/stats`),
  deleteListing: (urlId: string) => api.delete<void>(`/admin/listings/${urlId}`),
  deleteCrawlSource: (sourceId: string) => api.delete<void>(`/admin/crawl-sources/${sourceId}`),
  updateCrawlSource: (sourceId: string, payload: CrawlSourceUpdatePayload) =>
    api.patch<CrawlSource>(`/admin/crawl-sources/${sourceId}`, payload),
  runCrawlSource: (sourceId: string) => api.post<{ queued: boolean }>(`/admin/crawl-sources/${sourceId}/crawl`),
  rescanCrawlSource: (sourceId: string) => api.post<{ queued: number }>(`/admin/crawl-sources/${sourceId}/rescan`),
  scansByDay: (days = 180) => api.get<ScanDayCount[]>(`/admin/scans-by-day?days=${days}`),
  crawlSourceScansByDay: (sourceId: string, days = 180) =>
    api.get<ScanDayCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-day?days=${days}`),
};
