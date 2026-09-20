import { useEffect, useRef, useState } from "react";

/**
 * A "Sort ↓" button + menu for the admin tables. Column headers are still
 * clickable on desktop, but they're easy to miss, and on a phone some columns
 * are hidden entirely — this puts every sort a click away, with an explicit
 * direction ("Newest first") rather than a header that toggles blindly.
 * Stateless: the caller owns the sort key/direction.
 */
export function AdminSortMenu<K extends string>({
  options,
  sortKey,
  sortDirection,
  onChange,
}: {
  options: { key: K; label: string; ascLabel: string; descLabel: string }[];
  sortKey: K;
  sortDirection: "asc" | "desc";
  onChange: (key: K, direction: "asc" | "desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeLabel = options.find((option) => option.key === sortKey)?.label;

  return (
    <div className="action-dropdown" ref={containerRef}>
      <button
        type="button"
        className="rescan-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Sort
        {activeLabel && <span className="admin-sort__current">: {activeLabel}</span>} {sortDirection === "asc" ? "↑" : "↓"}
      </button>
      {open && (
        <div className="action-dropdown-menu admin-sort__menu" role="menu">
          {options.flatMap((option) =>
            (["asc", "desc"] as const).map((direction) => {
              const active = option.key === sortKey && direction === sortDirection;
              return (
                <button
                  key={`${option.key}-${direction}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(option.key, direction);
                    setOpen(false);
                  }}
                >
                  {option.label} · {direction === "asc" ? option.ascLabel : option.descLabel}
                  {active ? " ✓" : ""}
                </button>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
