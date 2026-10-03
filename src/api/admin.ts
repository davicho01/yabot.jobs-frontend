import { api } from "./client";
import { PAGE_SIZE } from "./jobs";
import type {
  AdminDashboard,
  AdminFeedback,
  AdminFeedbackList,
  CrawlSource,
  CrawlSourceStats,
  FeedbackKind,
  FeedbackStatus,
  JobDetail,
  JobList,
  ScanDayCount,
  ScanHourCount,
  ScanMonthCount,
  ScanWeekCount,
} from "./types";

export interface CrawlSourceUpdatePayload {
  name?: string;
  board_url?: string;
  status?: string;
}

export type JobSortKey = "company" | "title" | "status" | "discovered";
export type JobSortOrder = "asc" | "desc";

export interface AdminCompany {
  company_key: string;
  display_name: string;
  domain: string | null;
  domain_source: string | null;
  logo_url: string | null;
  // "logo_dev" (automatic) or "url"/"upload" (set by an admin; the automatic
  // sync never replaces those) — null when there's no logo.
  logo_origin: string | null;
  logo_status: string | null;
  logo_source_url: string | null;
  posting_count: number;
}

export const adminApi = {
  feedback: (params: { status?: FeedbackStatus; kind?: FeedbackKind; page?: number; pageSize?: number }) =>
    api.get<AdminFeedbackList>("/admin/feedback", {
      status: params.status,
      kind: params.kind,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    }),
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) =>
    api.patch<AdminFeedback>(`/admin/feedback/${feedbackId}`, { status }),
  dashboard: () => api.get<AdminDashboard>("/admin/dashboard"),
  crawlSources: () => api.get<CrawlSource[]>("/admin/crawl-sources"),
  crawlSourceStats: (sourceId: string) => api.get<CrawlSourceStats>(`/admin/crawl-sources/${sourceId}/stats`),
  jobs: (params: {
    sourceId?: string;
    scanFrom?: string;
    scanTo?: string;
    flagged?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: JobSortKey;
    sortOrder?: JobSortOrder;
  }) =>
    api.get<JobList>("/admin/jobs", {
      source_id: params.sourceId,
      scan_from: params.scanFrom,
      scan_to: params.scanTo,
      flagged: params.flagged,
      page: params.page ?? 1,
      page_size: params.pageSize ?? PAGE_SIZE,
      sort_by: params.sortBy ?? "discovered",
      sort_order: params.sortOrder ?? "desc",
    }),
  deleteListing: (urlId: string) => api.delete<void>(`/admin/listings/${urlId}`),
  // Clears a listing's open flag report (see jobsApi.flag) once it's been
  // looked into.
  dismissListingFlag: (urlId: string) => api.post<JobDetail>(`/admin/listings/${urlId}/flag/dismiss`),
  // Sets (or, with an empty domain, clears) a company's logo domain by hand —
  // see the backend's app.services.company_logos.set_manual_domain.
  updateCompanyDomain: (companyKey: string, domain: string | null) =>
    api.patch<AdminCompany>("/admin/companies", { company_key: companyKey, domain }),
  // The companies a source's postings belong to (usually one) — what the Edit
  // source dialog shows a logo field for.
  crawlSourceCompanies: (sourceId: string) => api.get<AdminCompany[]>(`/admin/crawl-sources/${sourceId}/companies`),
  // Copy the logo at `url` (an image, or a page it's on) as the company's logo.
  setCompanyLogoUrl: (companyKey: string, displayName: string, url: string) =>
    api.put<AdminCompany>("/admin/companies/logo", { company_key: companyKey, display_name: displayName, url }),
  uploadCompanyLogo: (companyKey: string, displayName: string, file: File) => {
    const form = new FormData();
    form.append("company_key", companyKey);
    form.append("display_name", displayName);
    form.append("file", file);
    return api.postForm<AdminCompany>("/admin/companies/logo-upload", form);
  },
  // Back to the automatic (logo.dev) logo, fetched on the next sync.
  clearCompanyLogo: (companyKey: string) =>
    api.delete<AdminCompany>(`/admin/companies/logo?company_key=${encodeURIComponent(companyKey)}`),
  deleteCrawlSource: (sourceId: string) => api.delete<void>(`/admin/crawl-sources/${sourceId}`),
  updateCrawlSource: (sourceId: string, payload: CrawlSourceUpdatePayload) =>
    api.patch<CrawlSource>(`/admin/crawl-sources/${sourceId}`, payload),
  runCrawlSource: (sourceId: string) => api.post<{ queued: boolean }>(`/admin/crawl-sources/${sourceId}/crawl`),
  rescanCrawlSource: (sourceId: string) => api.post<{ queued: number }>(`/admin/crawl-sources/${sourceId}/rescan`),
  scansByDay: (days = 180) => api.get<ScanDayCount[]>(`/admin/scans-by-day?days=${days}`),
  crawlSourceScansByDay: (sourceId: string, days = 180) =>
    api.get<ScanDayCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-day?days=${days}`),
  scansByHour: (hours = 24, end?: string) => api.get<ScanHourCount[]>("/admin/scans-by-hour", { hours, end }),
  crawlSourceScansByHour: (sourceId: string, hours = 24, end?: string) =>
    api.get<ScanHourCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-hour`, { hours, end }),
  scansByWeek: (weeks = 26) => api.get<ScanWeekCount[]>(`/admin/scans-by-week?weeks=${weeks}`),
  crawlSourceScansByWeek: (sourceId: string, weeks = 26) =>
    api.get<ScanWeekCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-week?weeks=${weeks}`),
  scansByMonth: (months = 6) => api.get<ScanMonthCount[]>(`/admin/scans-by-month?months=${months}`),
  crawlSourceScansByMonth: (sourceId: string, months = 6) =>
    api.get<ScanMonthCount[]>(`/admin/crawl-sources/${sourceId}/scans-by-month?months=${months}`),
};
