export interface User {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  email_alerts_enabled: boolean;
}

export interface JobPosting {
  id: string;
  url_id: string;
  // null for anonymous callers — the backend only includes the original
  // posting URL for logged-in users.
  apply_url: string | null;
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
  // null for anonymous callers — the backend only includes the original
  // posting URL for logged-in users.
  url: string | null;
  domain: string;
  scan_status: string;
  scan_error: string | null;
  crawl_source_id: string | null;
  last_scanned_at: string | null;
  created_at: string;
}

export interface JobDetail {
  url: JobPostingUrl;
  posting: JobPosting | null;
}

// A searchable area — a Census metro/micro area or a state — and how many
// postings fall in it.
export interface Metro {
  slug: string;
  name: string;
  kind: "metro" | "micro" | "state";
  count: number;
}

// What a city search covered: the city and how far around it was looked.
export interface SearchArea {
  label: string;
  radius_miles: number;
}

export interface JobList {
  items: JobDetail[];
  total: number;
  page: number;
  page_size: number;
  // Set when the location search was a city, searched by distance.
  search_area?: SearchArea | null;
}

// Other postings related to one job — see GET /jobs/{url_id}/similar.
export interface SimilarJobs {
  same_company: JobDetail[];
  similar_title: JobDetail[];
}

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";

// Trimmed to what the applications list/apply page actually read — the
// backend's ApplicationRead (app/schemas/application.py) only sends these
// fields, not the full JobPosting/TailoredResume/CoverLetter shapes.
export interface ApplicationJobPosting {
  id: string;
  url_id: string;
  apply_url: string;
  title: string | null;
  company_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
}

export interface ApplicationDocument {
  id: string;
  filename: string;
}

export interface Application {
  id: string;
  status: string;
  notes: string | null;
  is_archived: boolean;
  // When this row was first made — always set (saving/applying to a job
  // always adds one).
  created_at: string;
  // Set the moment status first switched to "applied" — null until then.
  applied_at: string | null;
  // A self-set "remind me about this one" day (not a specific time) — null
  // means no reminder wanted.
  follow_up_at: string | null;
  // Which resume the apply page's picker is set to for this application —
  // null means no explicit pick was ever saved (falls back to is_main).
  selected_resume_id: string | null;
  job_posting: ApplicationJobPosting;
  // Max of the fitness score and the tailored-resume score, whichever is set.
  best_score: number | null;
  latest_tailored_resume: ApplicationDocument | null;
  latest_cover_letter: ApplicationDocument | null;
}

export interface Resume {
  id: string;
  filename: string;
  content_type: string;
  is_main: boolean;
  created_at: string;
  // Whether this resume has been structured yet (LLM-broken-down into
  // summary/sections/contact — see the backend's Resume.structured_content)
  // — what GET /resumes/{id}/download?format=docx|pdf needs to be available.
  has_structured_content: boolean;
  // Groups every version of the same resume together — see
  // GET /resumes/{id}/versions. GET /resumes itself already returns one row
  // per family (the current main version, or the most recent if none is
  // main), so these two fields only matter once you're inside a family's
  // own version history.
  root_resume_id: string;
  version_number: number;
}

// Format a resume/tailored-resume/cover-letter can be downloaded/rendered as.
export type DocumentFormat = "docx" | "pdf";

// One rubric category's contribution to overall_score (backend:
// app.schemas.resume.ScoreCategoryBreakdown) — job_requirements/strengths/
// weaknesses here are scoped to this one category, distinct from the flat
// matched_keywords/missing_keywords on the containing ResumeScore. category
// is one of "required_skills" (50 pts) | "responsibilities" (30 pts) |
// "seniority" (15 pts) | "preferred_qualifications" (5 pts), always all 4
// present in that order (see app.services.resume_llm._CATEGORY_MAX).
export interface ScoreCategoryBreakdown {
  category: string;
  score: number;
  max_score: number;
  why: string;
  job_requirements: string[];
  strengths: string[];
  weaknesses: string[];
}

export interface ResumeScore {
  id: string;
  resume_id: string;
  job_posting_id: string;
  overall_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  summary: string;
  category_scores: ScoreCategoryBreakdown[];
  // Informational only — does not affect overall_score/category_scores,
  // which stay purely merit-based (see app.services.prompts.SCORE_PROMPT).
  // Empty string when the candidate isn't substantially overqualified.
  overqualification_note: string;
  created_at: string;
}

// See GET /resumes/{resume_id}/score-history.
export interface ResumeScoreHistoryEntry {
  id: string;
  job_posting_id: string;
  // What a history row links to — the ApplyPage route
  // (/jobs/:urlId/apply) is keyed on this, not job_posting_id.
  url_id: string;
  job_title: string | null;
  company_name: string | null;
  overall_score: number;
  missing_keywords: string[];
  created_at: string;
}

export interface RecurringMissingKeyword {
  keyword: string;
  count: number;
}

export interface ResumeScoreHistory {
  entries: ResumeScoreHistoryEntry[];
  recurring_missing_keywords: RecurringMissingKeyword[];
}

// See GET /resumes/missing-keywords — the richer analogue of
// ResumeScoreHistory's recurring_missing_keywords above, for one resume
// (main resume by default): same recurring-keyword idea, but with the jobs
// that asked for each skill attached instead of just a count.
export interface MissingSkillJobRef {
  job_posting_id: string;
  // What a job ref links to — same url_id convention as
  // ResumeScoreHistoryEntry above.
  url_id: string;
  job_title: string | null;
  company_name: string | null;
}

export interface MissingSkillSummaryEntry {
  keyword: string;
  count: number;
  jobs: MissingSkillJobRef[];
}

export interface MissingSkillsSummary {
  entries: MissingSkillSummaryEntry[];
}

// See GET /resumes/{resume_id}/roles — labels for this resume's own
// work-history entries, used to populate the "which job does this belong
// to" dropdown on a SkillAddition below.
export interface ResumeRoles {
  roles: string[];
}

// A candidate's draft explanation of a missing skill they actually have
// experience with — see app.models.resume.ResumeSkillAddition. Saved
// immediately on entry so progress across several skills survives a
// refresh; only consumed once "Add missing skills to resume" is pressed.
export interface SkillAddition {
  id: string;
  resume_id: string;
  keyword: string;
  target_role: string;
  explanation: string;
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

export interface TailoredResumeScore {
  id: string;
  tailored_resume_id: string;
  job_posting_id: string;
  overall_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  summary: string;
  category_scores: ScoreCategoryBreakdown[];
  // See ResumeScore.overqualification_note.
  overqualification_note: string;
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

export interface InterviewQuestion {
  question: string;
  category: "behavioral" | "technical" | "role_specific";
  // How this specific candidate should answer it, referencing their own resume.
  approach: string;
}

export interface InterviewPrep {
  id: string;
  resume_id: string;
  job_posting_id: string;
  content: {
    likely_questions: InterviewQuestion[];
    talking_points: string[];
    questions_to_ask: string[];
  };
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
  coverage_last_count: number | null;
  coverage_baseline: number | null;
  coverage_sample_count: number;
  coverage_flagged_at: string | null;
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
    crawl_sources_flagged: number;
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

export interface ScanDayCount {
  date: string;
  count: number;
}

export interface ScanHourCount {
  hour: string;
  count: number;
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

// A credential for third-party tools (e.g. the browser extension) to act on
// this user's behalf — see POST /auth/tokens. Unlike ApiKey, there's no
// masked form of it stored: the raw value only ever exists once, in
// PersonalAccessTokenCreateResult, right when it's minted.
export interface PersonalAccessToken {
  id: string;
  label: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PersonalAccessTokenCreateResult extends PersonalAccessToken {
  token: string;
}

// One column per GET /jobs query param worth persisting — mirrors JobFilters
// (api/jobs.ts) minus `page`. Re-run on a schedule server-side (see the
// backend's saved_search_alerts.py) to email a digest when something new
// matches.
export interface SavedSearch {
  id: string;
  name: string | null;
  q: string | null;
  location: string | null;
  metro: string | null;
  radius: number | null;
  company: string | null;
  posted_within_days: number | null;
  workplace_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  created_at: string;
  last_alerted_at: string | null;
}
