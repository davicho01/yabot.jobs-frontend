import { useState } from "react";
import { resumesApi } from "../api/resumes";
import type { CoverLetter } from "../api/types";
import { DownloadDropdown } from "./DownloadDropdown";
import "./DossierAction.css";

export function CoverLetterDownloadMenu({
  coverLetter,
  onRegenerate,
  isRegenerating,
}: {
  coverLetter: CoverLetter;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <DownloadDropdown>
        {(close) => (
          <>
            {(["docx", "pdf"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={async () => {
                  close();
                  setError(null);
                  try {
                    await resumesApi.downloadCoverLetter(coverLetter.id, coverLetter.filename, format);
                  } catch {
                    setError("Couldn't download the file. Try again.");
                  }
                }}
              >
                Download .{format}
              </button>
            ))}
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => {
                close();
                onRegenerate();
              }}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate"}
            </button>
          </>
        )}
      </DownloadDropdown>
      {error && <p className="dossier-action__error">{error}</p>}
    </div>
  );
}
