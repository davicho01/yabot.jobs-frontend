import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { resumesApi, type ResumeDetail } from "../api/resumes";
import { ApiError } from "../api/client";
import type { DocumentFormat, Resume } from "../api/types";
import { DownloadDropdown } from "../components/DownloadDropdown";
import { useConfirm } from "../components/ConfirmDialog";
import "./ResumePage.css";

// created_at here is a real timestamp, formatted in the viewer's own local
// time zone (unlike a job posting's date-only posted_at, which pins UTC).
function formatScoreHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ScoreHistoryPanel({ resumeId }: { resumeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["resume-score-history", resumeId],
    queryFn: () => resumesApi.scoreHistory(resumeId),
  });

  if (isLoading) {
    return <div className="resume-preview resume-preview--empty">Loading score history…</div>;
  }

  const entries = data?.entries ?? [];
  const recurring = data?.recurring_missing_keywords ?? [];

  if (entries.length === 0) {
    return (
      <div className="resume-preview resume-preview--empty">
        No scores yet for this resume — evaluate a posting on its apply page first.
      </div>
    );
  }

  return (
    <div className="score-history">
      <h2 className="score-history__heading">Score history</h2>
      <ul className="score-history__list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={`/jobs/${entry.url_id}/apply`} className="score-history__row">
              <div className="score-history__row-label">
                <span className="score-history__row-title">{entry.job_title ?? "Untitled role"}</span>
                <span className="score-history__row-meta">
                  {entry.company_name ?? "Unknown company"} · {formatScoreHistoryDate(entry.created_at)}
                </span>
              </div>
              <div className="score-history__bar-track">
                <div className="score-history__bar-fill" style={{ width: `${entry.overall_score}%` }} />
              </div>
              <span className="score-history__row-score">{entry.overall_score}</span>
            </Link>
          </li>
        ))}
      </ul>

      {recurring.length > 0 && (
        <div className="score-history__recurring">
          <h2 className="score-history__heading">Keywords that keep coming up missing</h2>
          <p className="settings-page__intro score-history__recurring-hint">
            Showed up as missing on 2 or more separate scores — worth adding to this resume if it's genuinely there.
          </p>
          <ul className="score-history__keyword-list">
            {recurring.map((k) => (
              <li key={k.keyword} className="tag tag--secondary">
                {k.keyword} <span className="score-history__keyword-count">×{k.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Shared by the per-resume row controls and the preview pane: the button
// that kicks off LLM structuring, plus (once it fails) either a generic
// retry message or — specifically for a missing default LLM key — a link to
// go add one, rather than a bare error.
function StructureControl({
  resumeId,
  mutation,
}: {
  resumeId: string;
  mutation: ReturnType<typeof useMutation<ResumeDetail, ApiError, string>>;
}) {
  const isThisRow = mutation.variables === resumeId;
  const isPending = isThisRow && mutation.isPending;
  const needsApiKey = isThisRow && mutation.isError && mutation.error instanceof ApiError && mutation.error.status === 422;
  const failedOtherwise = isThisRow && mutation.isError && !needsApiKey;

  return (
    <div className="resume-structure-control">
      <button type="button" onClick={() => mutation.mutate(resumeId)} disabled={isPending}>
        {isPending ? "Structuring…" : "Structure for download"}
      </button>
      {needsApiKey && (
        <p className="settings-section__hint">
          <Link to="/api-keys">Add an LLM API key</Link> to enable docx/PDF downloads.
        </p>
      )}
      {failedOtherwise && <p className="settings-page__error">Couldn't structure this resume. Try again.</p>}
    </div>
  );
}

export function ResumePage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Mutually exclusive with previewId — showing one clears the other, since
  // they share the same right-hand column.
  const [historyId, setHistoryId] = useState<string | null>(null);

  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list });
  const previewResume = resumesQuery.data?.find((r) => r.id === previewId) ?? null;

  function showPreview(id: string) {
    setHistoryId(null);
    setPreviewId(id);
  }

  function showHistory(id: string) {
    setPreviewId(null);
    setHistoryId(id);
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => resumesApi.upload(file),
    onSuccess: (resume) => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      if (fileInput.current) fileInput.current.value = "";
      showPreview(resume.id);
    },
  });

  const setMainMutation = useMutation({
    mutationFn: (id: string) => resumesApi.setMain(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });

  const deleteResumeMutation = useMutation({
    mutationFn: (id: string) => resumesApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setPreviewId((current) => (current === id ? null : current));
      setHistoryId((current) => (current === id ? null : current));
    },
  });

  async function removeResume(id: string, filename: string) {
    if (await confirm(`Remove "${filename}"? This can't be undone.`)) {
      deleteResumeMutation.mutate(id);
    }
  }

  const structureMutation = useMutation<ResumeDetail, ApiError, string>({
    mutationFn: (id: string) => resumesApi.structure(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });

  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadResume(resume: Resume, format: DocumentFormat) {
    setDownloadError(null);
    try {
      await resumesApi.downloadMainResume(resume.id, resume.filename, format);
    } catch {
      setDownloadError("Couldn't download the file. Try again.");
    }
  }

  function uploadFile(file: File | undefined) {
    if (file) uploadMutation.mutate(file);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    uploadFile(event.target.files?.[0]);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    uploadFile(event.dataTransfer.files?.[0]);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.current?.click();
    }
  }

  return (
    <main className="settings-page resume-page">
      <div className="resume-page__col">
        <h1>Your resume</h1>
        <p className="settings-page__intro">
          Powers the fitness report, resume tailoring, and cover letter tools on each posting's apply page.
        </p>

        <section className="settings-section">
          <div
            className={`resume-dropzone${isDragOver ? " resume-dropzone--active" : ""}${
              uploadMutation.isPending ? " resume-dropzone--busy" : ""
            }`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInput.current?.click()}
            onKeyDown={handleDropzoneKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Upload resume — drag and drop a file here, or click to browse"
          >
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx"
              className="resume-dropzone__input"
              onChange={handleFileInputChange}
              tabIndex={-1}
            />
            <div className="resume-dropzone__icon" aria-hidden="true">
              ⇪
            </div>
            <p className="resume-dropzone__label">
              {uploadMutation.isPending
                ? "Uploading…"
                : isDragOver
                  ? "Drop to upload"
                  : "Drag & drop your resume here, or click to browse"}
            </p>
            <p className="resume-dropzone__hint">PDF or DOCX, up to 5MB</p>
          </div>
          {uploadMutation.error && (
            <p className="settings-page__error">
              {uploadMutation.error instanceof ApiError ? uploadMutation.error.message : "Upload failed."}
            </p>
          )}

          <ul className="record-list">
            {resumesQuery.data?.map((resume) => (
              <li
                key={resume.id}
                className={`record-list__item${
                  resume.id === previewId || resume.id === historyId ? " record-list__item--active" : ""
                }`}
              >
                <div className="record-list__row">
                  <span>{resume.filename}</span>
                </div>
                <div className="record-list__row">
                  <div className="record-list__button-group">
                    {resume.is_main ? (
                      <span className="stamp stamp--positive">Main</span>
                    ) : (
                      <button type="button" onClick={() => setMainMutation.mutate(resume.id)}>
                        Set as main
                      </button>
                    )}
                    <button type="button" onClick={() => showPreview(resume.id)}>
                      Preview
                    </button>
                    <button type="button" onClick={() => showHistory(resume.id)}>
                      Score history
                    </button>
                  </div>
                </div>
                <div className="record-list__row">
                  <button
                    type="button"
                    className="record-list__remove"
                    onClick={() => removeResume(resume.id, resume.filename)}
                  >
                    Remove
                  </button>
                  <div className="record-list__download">
                    {resume.has_structured_content ? (
                      <DownloadDropdown triggerClassName="">
                        {(close) => (
                          <>
                            {(["docx", "pdf"] as const).map((format) => (
                              <button
                                key={format}
                                type="button"
                                onClick={() => {
                                  close();
                                  downloadResume(resume, format);
                                }}
                              >
                                Download .{format}
                              </button>
                            ))}
                          </>
                        )}
                      </DownloadDropdown>
                    ) : (
                      <StructureControl resumeId={resume.id} mutation={structureMutation} />
                    )}
                  </div>
                </div>
              </li>
            ))}
            {resumesQuery.data?.length === 0 && <li className="settings-section__hint">No resumes uploaded yet.</li>}
          </ul>
          {downloadError && <p className="settings-page__error">{downloadError}</p>}
        </section>
      </div>

      <div className="resume-page__preview-col">
        {historyId && <ScoreHistoryPanel resumeId={historyId} />}
        {!historyId && !previewResume && (
          <div className="resume-preview resume-preview--empty">Select a resume to preview it here.</div>
        )}
        {!historyId && previewResume && previewResume.content_type === "application/pdf" && (
          <iframe
            key={previewResume.id}
            className="resume-preview"
            src={resumesApi.previewUrl(previewResume.id)}
            title={`Preview of ${previewResume.filename}`}
          />
        )}
        {!historyId && previewResume && previewResume.content_type !== "application/pdf" && previewResume.has_structured_content && (
          <iframe
            key={previewResume.id}
            className="resume-preview"
            src={resumesApi.structuredPreviewUrl(previewResume.id, "pdf")}
            title={`Preview of ${previewResume.filename}`}
          />
        )}
        {!historyId && previewResume && previewResume.content_type !== "application/pdf" && !previewResume.has_structured_content && (
          <div className="resume-preview resume-preview--empty">
            <p>No preview yet for this file — structure it first.</p>
            <StructureControl resumeId={previewResume.id} mutation={structureMutation} />
          </div>
        )}
      </div>
      {dialog}
    </main>
  );
}
