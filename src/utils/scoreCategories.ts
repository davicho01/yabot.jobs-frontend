// Display labels for ResumeScore/TailoredResumeScore's category_scores
// (backend: app.services.resume_llm._CATEGORY_MAX) — the API returns the
// raw rubric key, this is just presentation.
export const CATEGORY_LABELS: Record<string, string> = {
  required_skills: "Required skills & qualifications",
  responsibilities: "Responsibilities & demonstrated outcomes",
  seniority: "Role scope & seniority alignment",
  preferred_qualifications: "Preferred qualifications",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
