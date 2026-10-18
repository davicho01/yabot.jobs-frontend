import { useEffect, useRef, useState } from "react";
import "./PillSelect.css";

// A form dropdown in place of a native <select>, styled like the header's
// pay filters ("Any maximum"): a pill showing the choice that turns magenta
// while open, over a rounded menu with a ✓ on the picked option.
export function PillSelect({
  value,
  options,
  onChange,
  labelledBy,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="pill-select" ref={containerRef}>
      <button
        type="button"
        className="pill-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pill-select__value">{selected?.label}</span>
        <svg viewBox="0 0 12 8" width="10" height="7" fill="none" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="pill-select__menu" role="listbox" aria-labelledby={labelledBy}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selected?.value}
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
            >
              {option.label}
              {option.value === selected?.value ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
