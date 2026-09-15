import { api } from "./client";
import type { AdminDashboard, CrawlSource, CrawlSourceStats } from "./types";

export const adminApi = {
  dashboard: () => api.get<AdminDashboard>("/admin/dashboard"),
  crawlSources: () => api.get<CrawlSource[]>("/crawl-sources"),
  crawlSourceStats: (sourceId: string) => api.get<CrawlSourceStats>(`/admin/crawl-sources/${sourceId}/stats`),
  deleteListing: (urlId: string) => api.delete<void>(`/admin/listings/${urlId}`),
};
