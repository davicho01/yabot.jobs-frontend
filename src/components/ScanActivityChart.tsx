import { useMemo, useState } from "react";
import type { ScanDayCount } from "../api/types";
import "./ScanActivityChart.css";

type Granularity = "day" | "week" | "month";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// How many trailing buckets each granularity shows — daily stays a 30-bar
// window (180 would be unreadable), week/month use everything fetched.
const VISIBLE_COUNT: Record<Granularity, number> = { day: 30, week: 26, month: 6 };

type Bucket = { key: string; label: string; rangeLabel: string; count: number };

function parseDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const DAY_FMT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
const MONTH_FMT: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };

function bucketData(data: ScanDayCount[], granularity: Granularity): Bucket[] {
  if (granularity === "day") {
    return data.map((d) => {
      const date = parseDay(d.date);
      const label = date.toLocaleDateString("en-US", DAY_FMT);
      return { key: d.date, label, rangeLabel: label, count: d.count };
    });
  }

  const buckets = new Map<string, Bucket>();
  for (const d of data) {
    const date = parseDay(d.date);
    if (granularity === "week") {
      const start = isoWeekStart(date);
      const key = start.toISOString().slice(0, 10);
      const existing = buckets.get(key);
      if (existing) {
        existing.count += d.count;
      } else {
        buckets.set(key, {
          key,
          label: start.toLocaleDateString("en-US", DAY_FMT),
          rangeLabel: `Week of ${start.toLocaleDateString("en-US", DAY_FMT)}`,
          count: d.count,
        });
      }
    } else {
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += d.count;
      } else {
        const label = date.toLocaleDateString("en-US", MONTH_FMT);
        buckets.set(key, { key, label, rangeLabel: label, count: d.count });
      }
    }
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceStep = residual > 5 ? 10 * magnitude : residual > 2 ? 5 * magnitude : residual > 1 ? 2 * magnitude : magnitude;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += niceStep) ticks.push(v);
  return ticks;
}

function roundedTopBarPath(x: number, width: number, top: number, bottom: number, radius: number): string {
  const height = bottom - top;
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (height <= 0) return "";
  return (
    `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} ` +
    `L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${bottom} Z`
  );
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const PADDING_LEFT = 40;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 12;

export function ScanActivityChart({
  title,
  data,
  isLoading,
}: {
  title: string;
  data: ScanDayCount[] | undefined;
  isLoading: boolean;
}) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  const buckets = useMemo(() => {
    if (!data) return [];
    const all = bucketData(data, granularity);
    return all.slice(-VISIBLE_COUNT[granularity]);
  }, [data, granularity]);

  const maxCount = Math.max(0, ...buckets.map((b) => b.count));
  const ticks = niceTicks(maxCount);
  const niceMax = ticks[ticks.length - 1] || 1;

  const plotWidth = CHART_WIDTH - PADDING_LEFT;
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const slot = buckets.length > 0 ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.min(24, slot * 0.6);

  // Skip labels once bars get dense enough that every tick would collide.
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));

  function yFor(count: number): number {
    return PADDING_TOP + plotHeight * (1 - count / niceMax);
  }

  return (
    <section className="admin-section">
      <div className="admin-section__header">
        <h2 className="admin-section__title">{title}</h2>
        <div className="scan-chart__controls">
          <div className="scan-chart__granularity" role="group" aria-label="Group by">
            {GRANULARITIES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`scan-chart__granularity-btn${granularity === key ? " scan-chart__granularity-btn--active" : ""}`}
                onClick={() => setGranularity(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="scan-chart__table-toggle" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "View chart" : "View table"}
          </button>
        </div>
      </div>

      {isLoading && <p className="admin-page__hint">Loading…</p>}

      {!isLoading && buckets.length === 0 && <p className="admin-page__hint">No scan activity yet.</p>}

      {!isLoading && buckets.length > 0 && showTable && (
        <div className="scan-chart__table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Listings scanned</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b) => (
                <tr key={b.key}>
                  <td>{b.rangeLabel}</td>
                  <td>{b.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && buckets.length > 0 && !showTable && (
        <div className="scan-chart">
          <svg
            className="scan-chart__svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}, ${granularity}ly`}
          >
            {ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PADDING_LEFT}
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                    className="scan-chart__gridline"
                  />
                  <text x={PADDING_LEFT - 8} y={y} className="scan-chart__tick-label" textAnchor="end" dominantBaseline="middle">
                    {tick.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {buckets.map((bucket, i) => {
              const x = PADDING_LEFT + i * slot + (slot - barWidth) / 2;
              const top = yFor(bucket.count);
              const bottom = CHART_HEIGHT - PADDING_BOTTOM;
              const isHovered = hovered === i;
              return (
                <g key={bucket.key}>
                  {/* Full-slot invisible hit target — easier to hover/focus than the bar itself. */}
                  <rect
                    x={PADDING_LEFT + i * slot}
                    y={PADDING_TOP}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${bucket.rangeLabel}: ${bucket.count.toLocaleString()} scanned`}
                    onPointerEnter={() => setHovered(i)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                  />
                  {bucket.count > 0 && (
                    <path
                      d={roundedTopBarPath(x, barWidth, top, bottom, 4)}
                      className={`scan-chart__bar${isHovered ? " scan-chart__bar--hovered" : ""}`}
                    />
                  )}
                  {i % labelStride === 0 && (
                    <text x={PADDING_LEFT + i * slot + slot / 2} y={CHART_HEIGHT - 6} className="scan-chart__tick-label" textAnchor="middle">
                      {bucket.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hovered !== null && buckets[hovered] && (
            <div
              className="scan-chart__tooltip"
              style={{ left: `${Math.min(92, Math.max(8, ((hovered + 0.5) / buckets.length) * 100))}%` }}
            >
              <span className="scan-chart__tooltip-value">{buckets[hovered].count.toLocaleString()}</span>
              <span className="scan-chart__tooltip-label">{buckets[hovered].rangeLabel}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
