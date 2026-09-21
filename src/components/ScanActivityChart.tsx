import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { ScanDayCount, ScanHourCount } from "../api/types";
import "./ScanActivityChart.css";

type Granularity = "hr" | "day" | "week" | "month";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "hr", label: "Hr" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// How many trailing buckets each granularity shows — hourly is a fixed 24h
// window, daily stays a 30-bar window (180 would be unreadable), week/month
// use everything fetched.
const VISIBLE_COUNT: Record<Granularity, number> = { hr: 24, day: 30, week: 26, month: 6 };

type Bucket = { key: string; label: string; rangeLabel: string; count: number; from: string; to: string };

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
const HOUR_FMT: Intl.DateTimeFormatOptions = { hour: "numeric" };
const HOUR_RANGE_FMT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

function bucketHourlyData(data: ScanHourCount[]): Bucket[] {
  return data.map((d) => {
    const date = new Date(d.hour);
    const to = new Date(date.getTime() + 60 * 60 * 1000);
    return {
      key: d.hour,
      label: date.toLocaleTimeString("en-US", HOUR_FMT),
      rangeLabel: date.toLocaleString("en-US", HOUR_RANGE_FMT),
      count: d.count,
      from: date.toISOString(),
      to: to.toISOString(),
    };
  });
}

function bucketData(data: ScanDayCount[], granularity: Granularity): Bucket[] {
  if (granularity === "day") {
    return data.map((d) => {
      const date = parseDay(d.date);
      const to = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      const label = date.toLocaleDateString("en-US", DAY_FMT);
      return { key: d.date, label, rangeLabel: label, count: d.count, from: date.toISOString(), to: to.toISOString() };
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
        const to = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        buckets.set(key, {
          key,
          label: start.toLocaleDateString("en-US", DAY_FMT),
          rangeLabel: `Week of ${start.toLocaleDateString("en-US", DAY_FMT)}`,
          count: d.count,
          from: start.toISOString(),
          to: to.toISOString(),
        });
      }
    } else {
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += d.count;
      } else {
        const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
        const label = date.toLocaleDateString("en-US", MONTH_FMT);
        buckets.set(key, { key, label, rangeLabel: label, count: d.count, from: start.toISOString(), to: to.toISOString() });
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

// Width used until the chart's container has been measured (first paint).
const DEFAULT_CHART_WIDTH = 800;
// The top padding leaves room above the tallest bar for its tooltip (~52px
// tall plus TOOLTIP_GAP), so the tooltip never has to cover the header.
const PADDING_TOP = 64;
const PLOT_HEIGHT = 184;
const PADDING_BOTTOM = 24;
const CHART_HEIGHT = PADDING_TOP + PLOT_HEIGHT + PADDING_BOTTOM;
const PADDING_LEFT = 40;
// Room right of the last bar so its tooltip can stay centered on it. Skipped
// on phones, where every pixel goes to the bars (the tooltip then falls back
// to shifting left, with its caret still pointing at the bar).
const PADDING_RIGHT_WIDE = 40;
const WIDE_CHART_MIN_WIDTH = 480;
// Space between the top of a bar and the tip of the tooltip's caret.
const TOOLTIP_GAP = 8;
// Rough horizontal room one x-axis label needs, used to decide how many to
// skip so they don't run into each other.
const MIN_LABEL_SPACING = 56;
// How far the tooltip may hang past the chart's right edge (into the card's
// padding) so the last bar's tooltip stays centered on it instead of sliding
// left over its neighbor.
const TOOLTIP_OVERHANG = 12;

export function ScanActivityChart({
  title,
  data,
  isLoading,
  hourlyData,
  isHourlyLoading,
  sourceId,
}: {
  title: string;
  data: ScanDayCount[] | undefined;
  isLoading: boolean;
  hourlyData?: ScanHourCount[] | undefined;
  isHourlyLoading?: boolean;
  sourceId?: string;
}) {
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  // The SVG is drawn at the container's real pixel width (rather than a fixed
  // viewBox stretched to fit) so text and bars keep their proportions on a
  // phone. A state-held node, not a ref, because the chart div only mounts
  // once data has loaded and the table view isn't showing.
  const [chartNode, setChartNode] = useState<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH);
  useEffect(() => {
    if (!chartNode) return;
    const measure = () => setChartWidth(Math.max(1, Math.round(chartNode.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(chartNode);
    return () => observer.disconnect();
  }, [chartNode]);

  // The tooltip is centered on its bar and only shifted by however much it
  // would overflow the chart, so its real width is measured (before paint).
  const [tooltipNode, setTooltipNode] = useState<HTMLDivElement | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  useLayoutEffect(() => {
    if (tooltipNode) setTooltipWidth(tooltipNode.offsetWidth);
  }, [tooltipNode, hovered]);

  function goToJobs(bucket: Bucket) {
    const params = new URLSearchParams();
    if (sourceId) params.set("sourceId", sourceId);
    params.set("scanFrom", bucket.from);
    params.set("scanTo", bucket.to);
    navigate(`/admin/jobs?${params.toString()}`);
  }

  const loading = granularity === "hr" ? Boolean(isHourlyLoading) : isLoading;

  const buckets = useMemo(() => {
    if (granularity === "hr") {
      if (!hourlyData) return [];
      return bucketHourlyData(hourlyData).slice(-VISIBLE_COUNT.hr);
    }
    if (!data) return [];
    const all = bucketData(data, granularity);
    return all.slice(-VISIBLE_COUNT[granularity]);
  }, [data, hourlyData, granularity]);

  const maxCount = Math.max(0, ...buckets.map((b) => b.count));
  const ticks = niceTicks(maxCount);
  const niceMax = ticks[ticks.length - 1] || 1;

  const paddingRight = chartWidth >= WIDE_CHART_MIN_WIDTH ? PADDING_RIGHT_WIDE : 0;
  const plotWidth = Math.max(1, chartWidth - PADDING_LEFT - paddingRight);
  const plotHeight = PLOT_HEIGHT;
  const slot = buckets.length > 0 ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.min(24, slot * 0.6);

  // Skip labels once bars get dense enough that every tick would collide.
  const maxLabels = Math.max(1, Math.floor(plotWidth / MIN_LABEL_SPACING));
  const labelStride = Math.max(1, Math.ceil(buckets.length / maxLabels));

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

      {loading && <p className="admin-page__hint">Loading…</p>}

      {!loading && buckets.length === 0 && <p className="admin-page__hint">No scan activity yet.</p>}

      {!loading && buckets.length > 0 && showTable && (
        <div className="scan-chart__table-wrap admin-table-wrap">
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

      {!loading && buckets.length > 0 && !showTable && (
        <div className="scan-chart" ref={setChartNode}>
          <svg
            className="scan-chart__svg"
            style={{ height: CHART_HEIGHT }}
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            role="img"
            aria-label={`${title}, ${granularity}ly`}
          >
            {ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PADDING_LEFT}
                    x2={chartWidth - paddingRight}
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
                    className="scan-chart__hit-target"
                    tabIndex={0}
                    role="button"
                    aria-label={`${bucket.rangeLabel}: ${bucket.count.toLocaleString()} scanned. View listings.`}
                    onPointerEnter={() => setHovered(i)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    onClick={() => goToJobs(bucket)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToJobs(bucket);
                      }
                    }}
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

          {hovered !== null && buckets[hovered] && (() => {
            const barCenterX = PADDING_LEFT + (hovered + 0.5) * slot;
            const barTopY = yFor(buckets[hovered].count);
            // Centered on the bar; shifted only when it would spill past an
            // edge of the chart. The caret is offset by the same amount so it
            // keeps pointing at the hovered bar.
            const halfWidth = tooltipWidth / 2;
            const left = Math.min(Math.max(barCenterX, halfWidth), Math.max(halfWidth, chartWidth + TOOLTIP_OVERHANG - halfWidth));
            return (
              <div
                ref={setTooltipNode}
                className="scan-chart__tooltip"
                style={{ left: `${left}px`, top: `${barTopY - TOOLTIP_GAP}px`, "--caret-shift": `${barCenterX - left}px` } as CSSProperties}
              >
                <span className="scan-chart__tooltip-value">{buckets[hovered].count.toLocaleString()}</span>
                <span className="scan-chart__tooltip-label">{buckets[hovered].rangeLabel}</span>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
