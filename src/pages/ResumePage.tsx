import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { renderAsync } from "docx-preview";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import "./ResumePage.css";

function DocxPreview({ resumeId, filename }: { resumeId: string; filename: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setStatus("loading");

    resumesApi
      .previewBlob(resumeId)
      .then((blob) => renderAsync(blob, container))
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  return (
    <div className="resume-preview resume-preview--docx">
      {status === "loading" && <p className="resume-preview__status">Rendering preview…</p>}
      {status === "error" && (
        <div className="resume-preview__status">
          <p>Couldn't render a preview for this file.</p>
          <a href={resumesApi.previewUrl(resumeId)} target="_blank" rel="noreferrer">
            Open {filename} in a new tab →
          </a>
        </div>
      )}
      <div ref={containerRef} className="docx-preview-container" />
    </div>
  );
}

export function ResumePage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: resumesApi.list });
  const previewResume = resumesQuery.data?.find((r) => r.id === previewId) ?? null;

  const uploadMutation = useMutation({
    mutationFn: (file: File) => resumesApi.upload(file),
    onSuccess: (resume) => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      if (fileInput.current) fileInput.current.value = "";
      setPreviewId(resume.id);
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
    },
  });

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
                className={`record-list__item${resume.id === previewId ? " record-list__item--active" : ""}`}
              >
                <span>{resume.filename}</span>
                {resume.is_main ? (
                  <span className="stamp stamp--positive">Main</span>
                ) : (
                  <button type="button" onClick={() => setMainMutation.mutate(resume.id)}>
                    Set as main
                  </button>
                )}
                <button type="button" onClick={() => setPreviewId(resume.id)}>
                  Preview
                </button>
                <button
                  type="button"
                  className="record-list__remove"
                  onClick={() => deleteResumeMutation.mutate(resume.id)}
                >
                  Remove
                </button>
              </li>
            ))}
            {resumesQuery.data?.length === 0 && <li className="settings-section__hint">No resumes uploaded yet.</li>}
          </ul>
        </section>
      </div>

      <div className="resume-page__preview-col">
        {!previewResume && <div className="resume-preview resume-preview--empty">Select a resume to preview it here.</div>}
        {previewResume && previewResume.content_type === "application/pdf" && (
          <iframe
            key={previewResume.id}
            className="resume-preview"
            src={resumesApi.previewUrl(previewResume.id)}
            title={`Preview of ${previewResume.filename}`}
          />
        )}
        {previewResume && previewResume.content_type !== "application/pdf" && (
          <DocxPreview key={previewResume.id} resumeId={previewResume.id} filename={previewResume.filename} />
        )}
      </div>
    </main>
  );
}
