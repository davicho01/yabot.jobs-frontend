import { api, downloadFile, fetchBlob, fileUrl } from "./client";
import type {
  CoverLetter,
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
  previewBlob: (id: string) => fetchBlob(`/resumes/${id}/download`),
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
  downloadTailored: (id: string, filename: string) => downloadFile(`/resumes/tailored/${id}/download`, filename),

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
  downloadCoverLetter: (id: string, filename: string) =>
    downloadFile(`/resumes/cover-letter/${id}/download`, filename),

  getInterviewPrep: (jobPostingId: string, resumeId?: string) =>
    api.get<InterviewPrep>("/resumes/main/interview-prep", { job_posting_id: jobPostingId, resume_id: resumeId }),
  generateInterviewPrep: (jobPostingId: string, resumeId?: string) =>
    api.post<InterviewPrep>("/resumes/main/interview-prep", undefined, {
      job_posting_id: jobPostingId,
      resume_id: resumeId,
    }),
};
