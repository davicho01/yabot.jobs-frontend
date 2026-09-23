import { useEffect, useRef, useState } from "react";
import type { ApplicationStatus } from "../api/types";
import { STATUSES } from "../utils/applicationStatus";
import "./StatusSelect.css";

// Same button-opens-a-menu dropdown as ResumeSelect (action-dropdown /
// rescan-button / action-dropdown-menu, all already styled globally via
// components/DossierAction.css and index.css) — replaces the native
// <select> that used to sit in Notes, which looked out of place (an
// OS-styled control) next to every other dropdown-shaped control on the
// page.
export function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: ApplicationStatus;
  disabled?: boolean;
  onChange: (status: ApplicationStatus) => void;
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
    <div className="action-dropdown status-select" ref={containerRef}>
      <button
        type="button"
        className="rescan-button status-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${value}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="status-select__value" aria-hidden="true">
          {value}
        </span>
        <span className="status-select__arrow" aria-hidden="true">
          ↓
        </span>
      </button>
      {open && (
        <div className="action-dropdown-menu status-select__menu" role="listbox">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === value}
              onClick={() => {
                setOpen(false);
                onChange(s);
              }}
            >
              {s}
              {s === value ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
