import { api } from "./client";
import type { AdminDashboard, CrawlSource, CrawlSourceStats, ScanDayCount } from "./types";

export const adminApi = {
  dashboard: () => api.get<AdminDashboard>("/admin/dashboard"),
  crawlSources: () => api.get<CrawlSource[]>("/admin/crawl-sources"),
  crawlSourceStats: (sourceId: string) => api.get<CrawlSourceStats>(`/admin/crawl-sources/${sourceId}/stats`),
  deleteListing: (urlId: string) => api.delete<void>(`/admin/listings/${urlId}`),
  deleteCrawlSource: (sourceId: string) => api.delete<void>(`/admin/crawl-sources/${sourceId}`),
  scansByDay: (days = 180) => api.get<ScanDayCount[]>(`/admin/scans-by-day?days=${days}`),
  crawlSourceScansByDay: (sourceId: string, days = 180) =>
    api.get<ScanDayCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-day?days=${days}`),
};
