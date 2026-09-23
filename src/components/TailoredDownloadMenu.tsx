import { useEffect, useRef, useState } from "react";
import { resumesApi } from "../api/resumes";
import type { TailoredResume } from "../api/types";
import "./DossierAction.css";

// Mirrors DownloadMenu on the applications list page: the button doubles as
// the dropdown's trigger, and closing on outside-click keeps it from
// lingering open while the user works elsewhere on the page.
export function TailoredDownloadMenu({
  tailoredResume,
  onRegenerate,
  isRegenerating,
}: {
  tailoredResume: TailoredResume;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button type="button" className="rescan-button" onClick={() => setOpen((o) => !o)}>
        Download .docx ↓
      </button>
      {open && (
        <div className="action-dropdown-menu">
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              setError(null);
              try {
                await resumesApi.downloadTailored(tailoredResume.id, tailoredResume.filename);
              } catch {
                setError("Couldn't download the file. Try again.");
              }
            }}
          >
            Download .docx
          </button>
          <button
            type="button"
            disabled={isRegenerating}
            onClick={() => {
              setOpen(false);
              onRegenerate();
            }}
          >
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      )}
      {error && <p className="dossier-action__error">{error}</p>}
    </div>
  );
}
