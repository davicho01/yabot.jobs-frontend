export interface User {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export interface JobPosting {
  id: string;
  url_id: string;
  apply_url: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  workplace_type: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  extracted_fields: Record<string, unknown> | null;
  posted_at: string | null;
  scanned_at: string | null;
  extraction_status: string;
}

export interface JobPostingUrl {
  id: string;
  url: string;
  domain: string;
  scan_status: string;
  scan_error: string | null;
  last_scanned_at: string | null;
  created_at: string;
}

export interface JobDetail {
  url: JobPostingUrl;
  posting: JobPosting | null;
}

export interface JobList {
  items: JobDetail[];
  total: number;
  page: number;
  page_size: number;
}

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";

export interface Application {
  id: string;
  status: string;
  applied_at: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  job_posting: JobPosting;
  latest_score: ResumeScore | null;
  latest_tailored_resume: TailoredResume | null;
  latest_cover_letter: CoverLetter | null;
}

export interface Resume {
  id: string;
  filename: string;
  content_type: string;
  is_main: boolean;
  created_at: string;
}

export interface ResumeScore {
  id: string;
  resume_id: string;
  job_posting_id: string;
  overall_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  summary: string;
  created_at: string;
}

export interface TailoredResume {
  id: string;
  resume_id: string;
  job_posting_id: string;
  content: { summary: string; sections: { heading: string; bullets: string[] }[] };
  filename: string;
  created_at: string;
}

export interface CoverLetter {
  id: string;
  resume_id: string;
  job_posting_id: string;
  content: { greeting: string; body_paragraphs: string[]; closing: string };
  filename: string;
  created_at: string;
}

export interface CrawlSource {
  id: string;
  name: string;
  ats_type: string | null;
  board_url: string;
  status: string;
  is_active: boolean;
  last_crawled_at: string | null;
  last_job_count: number | null;
  last_error: string | null;
  created_at: string;
}

export interface WindowCounts {
  last_24h: number;
  last_7d: number;
  last_30d: number;
  last_90d: number;
}

export interface AdminDashboard {
  totals: {
    job_listings: number;
    crawl_sources: number;
    users: number;
  };
  users_joined: WindowCounts;
  user_activity: WindowCounts;
  application_scans: WindowCounts;
}

export interface CrawlSourceStats {
  source: CrawlSource;
  total_listings: number;
  listings_added: WindowCounts;
  scans: WindowCounts;
}

export interface ApiKey {
  id: string;
  provider: string;
  label: string;
  model: string | null;
  base_url: string | null;
  is_active: boolean;
  is_default: boolean;
  last_used_at: string | null;
  created_at: string;
  masked_key: string;
}
