import type { WindowCounts } from "../api/types";
import "./AdminWindowStats.css";

const WINDOWS: { key: keyof WindowCounts; label: string }[] = [
  { key: "last_24h", label: "24h" },
  { key: "last_7d", label: "7d" },
  { key: "last_30d", label: "30d" },
  { key: "last_90d", label: "90d" },
];

export function AdminWindowStats({ title, counts }: { title: string; counts: WindowCounts }) {
  return (
    <div className="admin-window">
      <h3 className="admin-window__title">{title}</h3>
      <div className="admin-window__row">
        {WINDOWS.map(({ key, label }) => (
          <div key={key} className="admin-window__stat">
            <span className="admin-window__value">{counts[key].toLocaleString()}</span>
            <span className="admin-window__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
