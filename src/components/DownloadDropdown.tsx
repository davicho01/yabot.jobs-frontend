import { useEffect, useRef, useState, type ReactNode } from "react";
import "./DossierAction.css";

// Shared "Download ↓" dropdown shell: trigger button, outside-click-to-close,
// and the menu wrapper — callers supply the menu's contents (format buttons,
// an optional Regenerate action, etc.) via children, and render their own
// error message below this component. See TailoredDownloadMenu,
// CoverLetterDownloadMenu, and ResumePage's per-resume download control for
// the three current shapes built on top of this.
export function DownloadDropdown({
  children,
  triggerClassName = "rescan-button",
}: {
  children: (close: () => void) => ReactNode;
  triggerClassName?: string;
}) {
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

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button type="button" className={triggerClassName} onClick={() => setOpen((o) => !o)}>
        Download ↓
      </button>
      {open && <div className="action-dropdown-menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
