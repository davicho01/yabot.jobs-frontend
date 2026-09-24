import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import { AddSkillModal } from "../components/AddSkillModal";
import { ResumeSelect } from "../components/ResumeSelect";
import "./ResumeOptimizationPage.css";

// The cross-application analogue of ResumePage's ScoreHistoryPanel
// "Keywords that keep coming up missing" panel — same idea, but with the
// actual jobs that asked for each skill attached instead of just a count,
// and a way to act on a gap: explain the real experience behind it (see
// AddSkillModal) and, once ready, turn every explanation into a bullet
// point on a brand-new resume. Scoped to one resume at a time (defaulting
// to the main one), same as every other resume feature — scoring itself is
// always done against a specific selected resume (see ResumeSelect/
// ApplyPage), so a candidate running several resumes for different tracks
// shouldn't see their gaps blended together.
export function ResumeOptimizationPage() {
  const queryClient = useQueryClient();
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list });
  const resumes = resumesQuery.data ?? [];
  const mainResume = resumes.find((r) => r.is_main) ?? null;
  const [pickedResumeId, setPickedResumeId] = useState<string | null>(null);
  const selectedResumeId = pickedResumeId ?? mainResume?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["missing-keywords", selectedResumeId],
    queryFn: () => resumesApi.missingKeywordsSummary(selectedResumeId ?? undefined),
    enabled: !!selectedResumeId,
  });
  const skillAdditionsQuery = useQuery({
    queryKey: ["skill-additions", selectedResumeId],
    queryFn: () => resumesApi.listSkillAdditions(selectedResumeId!),
    enabled: !!selectedResumeId,
  });
  const skillAdditions = skillAdditionsQuery.data ?? [];
  const additionByKeyword = new Map(skillAdditions.map((a) => [a.keyword, a]));

  const [openKeywords, setOpenKeywords] = useState<Record<string, boolean>>({});
  const toggleKeyword = (keyword: string) => {
    setOpenKeywords((prev) => ({ ...prev, [keyword]: !prev[keyword] }));
  };
  const [activeModalKeyword, setActiveModalKeyword] = useState<string | null>(null);

  const applyMutation = useMutation({
    mutationFn: () => resumesApi.applySkillAdditions(selectedResumeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-additions", selectedResumeId] });
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
  });

  const entries = data?.entries ?? [];

  return (
    <main className="resume-optimization-page">
      <h1>Resume optimization</h1>
      <p className="resume-optimization-page__intro">
        Skills that keep showing up as missing across the jobs you've applied to with this resume — some of these
        might already be on it in different words, or genuine gaps worth addressing.
      </p>
      {resumes.length > 1 && (
        <div className="resume-optimization-page__resume-picker">
          <ResumeSelect
            resumes={resumes}
            selectedId={selectedResumeId ?? ""}
            onChange={(id) => {
              setPickedResumeId(id);
              setOpenKeywords({});
            }}
          />
        </div>
      )}

      {isLoading && <p className="resume-optimization-page__empty">Loading…</p>}
      {!isLoading && selectedResumeId && entries.length === 0 && (
        <p className="resume-optimization-page__empty">
          Nothing recurring yet — score a few more jobs with this resume and patterns will show up here.
        </p>
      )}
      {!resumesQuery.isLoading && !selectedResumeId && (
        <p className="resume-optimization-page__empty">
          Upload a resume first — see <Link to="/resume">My resume</Link>.
        </p>
      )}

      {entries.length > 0 && (
        <>
          {applyMutation.isSuccess ? (
            <p className="resume-optimization-page__success">
              Done — created a new resume with those additions. Head to <Link to="/resume">My resume</Link> to
              review it and set it as your main resume.
            </p>
          ) : (
            <div className="resume-optimization-page__apply-bar">
              <button
                type="button"
                className="resume-optimization-page__apply-button"
                disabled={skillAdditions.length === 0 || applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? "Applying…" : "Add missing skills to resume"}
              </button>
              {skillAdditions.length === 0 && (
                <span className="resume-optimization-page__apply-hint">
                  Add at least one skill below to enable this.
                </span>
              )}
            </div>
          )}
          {applyMutation.error && (
            <p className="resume-optimization-page__error">
              {applyMutation.error instanceof ApiError ? applyMutation.error.message : "Something went wrong."}
            </p>
          )}

          <ul className="resume-optimization-page__list">
            {entries.map((entry) => {
              const isOpen = !!openKeywords[entry.keyword];
              const bodyId = `missing-skill-body-${entry.keyword}`;
              const existingAddition = additionByKeyword.get(entry.keyword);
              return (
                <li key={entry.keyword} className="resume-optimization-page__entry">
                  <div className="resume-optimization-page__entry-header">
                    <button
                      type="button"
                      className="resume-optimization-page__entry-toggle"
                      onClick={() => toggleKeyword(entry.keyword)}
                      aria-expanded={isOpen}
                      aria-controls={bodyId}
                    >
                      <span className="tag tag--secondary">{entry.keyword}</span>
                      <span className="resume-optimization-page__entry-header-right">
                        <span className="resume-optimization-page__entry-count">×{entry.count} jobs</span>
                        <span className="resume-optimization-page__entry-toggle-icon" aria-hidden="true">
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rescan-button"
                      onClick={() => setActiveModalKeyword(entry.keyword)}
                    >
                      {existingAddition ? "Edit addition" : "Add to resume"}
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="resume-optimization-page__job-list" id={bodyId}>
                      {entry.jobs.map((job) => (
                        <li key={job.job_posting_id}>
                          <Link to={`/jobs/${job.url_id}/apply`}>
                            {job.job_title ?? "Untitled role"} · {job.company_name ?? "Unknown company"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {activeModalKeyword && selectedResumeId && (
        <AddSkillModal
          resumeId={selectedResumeId}
          keyword={activeModalKeyword}
          existing={additionByKeyword.get(activeModalKeyword)}
          onClose={() => setActiveModalKeyword(null)}
        />
      )}
    </main>
  );
}
