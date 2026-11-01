import { api } from "./client";

// The answer slugs the backend accepts (app.schemas.survey).
export type SurveySource = "google" | "reddit" | "friend" | "social" | "ai_chat" | "other";
export type SurveyDuration = "just_started" | "lt_1m" | "1_3m" | "3_6m" | "6m_plus" | "employed_browsing";
export type SurveyIndustry =
  | "tech"
  | "healthcare"
  | "finance"
  | "education"
  | "retail"
  | "hospitality"
  | "manufacturing_logistics"
  | "construction_trades"
  | "government_nonprofit"
  | "marketing_media"
  | "legal"
  | "energy_utilities"
  | "other";
export type SurveyArrangement = "remote" | "hybrid" | "on_site";
export type SurveyRating = "very_useful" | "somewhat_useful" | "dont_care" | "confusing" | "didnt_notice";
export type SurveyLiked = "fresh_jobs" | "company_sites" | "search_filters" | "alerts" | "clean_site" | "no_ads";
export type SurveyWanted =
  | "better_search"
  | "salary_info"
  | "resume_tools"
  | "app_tracking"
  | "more_companies"
  | "mobile_app";

// One page of answers; only what's present is saved.
export interface SurveySubmitPayload {
  visitor_id: string;
  completed?: boolean;
  source?: SurveySource;
  search_duration?: SurveyDuration;
  industries?: SurveyIndustry[];
  role_name?: string;
  work_arrangement?: SurveyArrangement[];
  verification_dates_rating?: SurveyRating;
  dedup_rating?: SurveyRating;
  liked?: SurveyLiked[];
  wanted?: SurveyWanted[];
  comments?: string;
  contact_email?: string;
}

export interface AdminSurveyResponse {
  id: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  user_id: string | null;
  user_email: string | null;
  contact_email: string | null;
  source: string | null;
  search_duration: string | null;
  industries: string[] | null;
  role_name: string | null;
  work_arrangement: string[] | null;
  verification_dates_rating: string | null;
  dedup_rating: string | null;
  liked: string[] | null;
  wanted: string[] | null;
  comments: string | null;
}

export interface AdminSurveyList {
  items: AdminSurveyResponse[];
  total: number;
  completed_count: number;
  counts: Record<string, Record<string, number>>;
}

export const surveyApi = {
  submit: (payload: SurveySubmitPayload) => api.post<{ completed: boolean }>("/survey", payload),
  adminList: (params: { completedOnly?: boolean; page?: number; pageSize?: number }) =>
    api.get<AdminSurveyList>("/admin/survey", {
      completed_only: params.completedOnly ? "true" : undefined,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    }),
};
