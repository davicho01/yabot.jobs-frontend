import { useEffect, useId, useRef, useState } from "react";
import "./ResumeSelect.css";

// The same button-opens-a-menu dropdown shape used throughout the app
// (action-dropdown / rescan-button / action-dropdown-menu, all styled
// globally via components/DossierAction.css and index.css), plus the
// "Resume" label ApplyPage's dashboard needs above the button.
export function ResumeSelect({
  resumes,
  selectedId,
  onChange,
}: {
  resumes: { id: string; filename: string; is_main: boolean }[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (resumes.length === 0) return null;
  const selected = resumes.find((r) => r.id === selectedId);

  return (
    <div className="resume-select">
      <span className="resume-select__label" id={labelId}>
        Resume
      </span>
      <div className="action-dropdown resume-select__dropdown" ref={containerRef}>
        <button
          type="button"
          className="rescan-button resume-select__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} resume-select-value-${labelId}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span id={`resume-select-value-${labelId}`} className="resume-select__filename">
            {selected ? selected.filename : "Choose resume"}
          </span>
          <span className="resume-select__arrow" aria-hidden="true">
            ↓
          </span>
        </button>
        {open && (
          <div className="action-dropdown-menu" role="listbox">
            {resumes.map((resume) => (
              <button
                key={resume.id}
                type="button"
                role="option"
                aria-selected={resume.id === selectedId}
                onClick={() => {
                  setOpen(false);
                  onChange(resume.id);
                }}
              >
                {resume.filename}
                {resume.is_main ? " (main)" : ""}
                {resume.id === selectedId ? " ✓" : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
