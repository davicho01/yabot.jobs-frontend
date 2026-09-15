import { api, downloadFile, fetchBlob, fileUrl } from "./client";
import type { CoverLetter, Resume, ResumeScore, TailoredResume } from "./types";

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

  getScore: (jobPostingId: string) => api.get<ResumeScore>("/resumes/main/score", { job_posting_id: jobPostingId }),
  generateScore: (jobPostingId: string) =>
    api.post<ResumeScore>("/resumes/main/score", undefined, { job_posting_id: jobPostingId }),

  getTailored: (jobPostingId: string) =>
    api.get<TailoredResume>("/resumes/main/tailored", { job_posting_id: jobPostingId }),
  generateTailored: (jobPostingId: string) =>
    api.post<TailoredResume>("/resumes/main/tailored", undefined, { job_posting_id: jobPostingId }),
  downloadTailored: (id: string, filename: string) => downloadFile(`/resumes/tailored/${id}/download`, filename),

  getCoverLetter: (jobPostingId: string) =>
    api.get<CoverLetter>("/resumes/main/cover-letter", { job_posting_id: jobPostingId }),
  generateCoverLetter: (jobPostingId: string) =>
    api.post<CoverLetter>("/resumes/main/cover-letter", undefined, { job_posting_id: jobPostingId }),
  downloadCoverLetter: (id: string, filename: string) =>
    downloadFile(`/resumes/cover-letter/${id}/download`, filename),
};
