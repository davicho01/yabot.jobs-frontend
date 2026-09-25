import { api, downloadFile, fileUrl } from "./client";
import type {
  CoverLetter,
  DocumentFormat,
  InterviewPrep,
  MissingSkillsSummary,
  Resume,
  ResumeRoles,
  ResumeScore,
  ResumeScoreHistory,
  SkillAddition,
  TailoredResume,
  TailoredResumeScore,
} from "./types";

// Extends Resume with the parsed text + (once generated) structured content
// — see ResumeDetailRead. Only GET /resumes/{id}/structure and .../main
// return this; the list endpoint stays on the lighter Resume shape.
export interface ResumeDetail extends Resume {
  parsed_text: string;
  structured_content: { summary: string; sections: unknown[]; contact: unknown } | null;
}

export const resumesApi = {
  list: () => api.get<Resume[]>("/resumes"),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<Resume>("/resumes", form);
  },
  setMain: (id: string) => api.patch<Resume>(`/resumes/${id}`, { is_main: true }),
  remove: (id: string) => api.delete<void>(`/resumes/${id}`),
  previewUrl: (id: string) => fileUrl(`/resumes/${id}/download`),
  // Inline (not attachment) render of a resume's *structured* content —
  // only meaningful once has_structured_content is true. Used for the
  // docx-original preview iframe, which otherwise has no native in-browser
  // renderer (see ResumePage.tsx).
  structuredPreviewUrl: (id: string, format: DocumentFormat) =>
    fileUrl(`/resumes/${id}/download`, { format, disposition: "inline" }),
  structure: (id: string) => api.post<ResumeDetail>(`/resumes/${id}/structure`),
  downloadMainResume: (id: string, filename: string, format: DocumentFormat) =>
    downloadFile(`/resumes/${id}/download`, filename, { format }),
  scoreHistory: (id: string) => api.get<ResumeScoreHistory>(`/resumes/${id}/score-history`),

  // resumeId is omitted (undefined) to mean "my main resume" — the
  // backend's own default (app.api.routes.resumes._resolve_resume) when
  // resume_id isn't sent, same as before resume selection existed. Passed
  // explicitly, it scores/tailors/writes against that resume instead —
  // see ResumeSelect, ApplyPage's resume picker (#8).
  missingKeywordsSummary: (resumeId?: string) =>
    api.get<MissingSkillsSummary>("/resumes/missing-keywords", { resume_id: resumeId }),
  roles: (resumeId: string) => api.get<ResumeRoles>(`/resumes/${resumeId}/roles`),
  listSkillAdditions: (resumeId: string) => api.get<SkillAddition[]>(`/resumes/${resumeId}/skill-additions`),
  saveSkillAddition: (
    resumeId: string,
    payload: { keyword: string; target_role: string; explanation: string },
  ) => api.post<SkillAddition>(`/resumes/${resumeId}/skill-additions`, payload),
  deleteSkillAddition: (resumeId: string, additionId: string) =>
    api.delete<void>(`/resumes/${resumeId}/skill-additions/${additionId}`),
  applySkillAdditions: (resumeId: string) => api.post<Resume>(`/resumes/${resumeId}/skill-additions/apply`),
  getScore: (jobPostingId: string, resumeId?: string) =>
    api.get<ResumeScore>("/resumes/main/score", { job_posting_id: jobPostingId, resume_id: resumeId }),
  generateScore: (jobPostingId: string, resumeId?: string) =>
    api.post<ResumeScore>("/resumes/main/score", undefined, { job_posting_id: jobPostingId, resume_id: resumeId }),
  // Comprehensive, opt-in follow-up to generateScore — fills in the same
  // score row's category breakdown in place (see app.models.resume.ResumeScore).
  generateEvaluation: (jobPostingId: string, resumeId?: string) =>
    api.post<ResumeScore>("/resumes/main/evaluation", undefined, {
      job_posting_id: jobPostingId,
      resume_id: resumeId,
    }),

  getTailored: (jobPostingId: string, resumeId?: string) =>
    api.get<TailoredResume>("/resumes/main/tailored", { job_posting_id: jobPostingId, resume_id: resumeId }),
  generateTailored: (jobPostingId: string, resumeId?: string) =>
    api.post<TailoredResume>("/resumes/main/tailored", undefined, {
      job_posting_id: jobPostingId,
      resume_id: resumeId,
    }),
  downloadTailored: (id: string, filename: string, format: DocumentFormat = "docx") =>
    downloadFile(`/resumes/tailored/${id}/download`, filename, { format }),

  getTailoredScore: (tailoredResumeId: string) =>
    api.get<TailoredResumeScore>(`/resumes/tailored/${tailoredResumeId}/score`),
  generateTailoredScore: (tailoredResumeId: string) =>
    api.post<TailoredResumeScore>(`/resumes/tailored/${tailoredResumeId}/score`),
  generateTailoredEvaluation: (tailoredResumeId: string) =>
    api.post<TailoredResumeScore>(`/resumes/tailored/${tailoredResumeId}/evaluation`),

  getCoverLetter: (jobPostingId: string, resumeId?: string) =>
    api.get<CoverLetter>("/resumes/main/cover-letter", { job_posting_id: jobPostingId, resume_id: resumeId }),
  generateCoverLetter: (jobPostingId: string, resumeId?: string) =>
    api.post<CoverLetter>("/resumes/main/cover-letter", undefined, {
      job_posting_id: jobPostingId,
      resume_id: resumeId,
    }),
  downloadCoverLetter: (id: string, filename: string, format: DocumentFormat = "docx") =>
    downloadFile(`/resumes/cover-letter/${id}/download`, filename, { format }),

  getInterviewPrep: (jobPostingId: string, resumeId?: string) =>
    api.get<InterviewPrep>("/resumes/main/interview-prep", { job_posting_id: jobPostingId, resume_id: resumeId }),
  generateInterviewPrep: (jobPostingId: string, resumeId?: string) =>
    api.post<InterviewPrep>("/resumes/main/interview-prep", undefined, {
      job_posting_id: jobPostingId,
      resume_id: resumeId,
    }),
};
