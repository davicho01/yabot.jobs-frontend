import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import type { ScanDayCount, ScanHourCount, ScanMonthCount, ScanWeekCount } from "../api/types";
import "./ScanActivityChart.css";

type Granularity = "hr" | "day" | "week" | "month";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "hr", label: "Hr" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// How many trailing buckets each granularity requests from the backend —
// the bars the chart shows at once. Hourly isn't here: it shows one local
// calendar day (see hourWindow), paged a day at a time via the nav arrows.
const REQUEST_COUNT: Record<Exclude<Granularity, "hr">, number> = { day: 30, week: 26, month: 6 };

const HOUR_MS = 60 * 60 * 1000;

// The hourly request for the local calendar day `daysAgo` days back: its
// hours from midnight through 11pm, or through the current hour for today.
// Counted from real midnights, so DST days get their 23 or 25 hours.
function hourWindow(daysAgo: number): { dayStart: Date; hours: number; end?: string } {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  if (daysAgo === 0) {
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);
    return { dayStart, hours: Math.round((currentHour.getTime() - dayStart.getTime()) / HOUR_MS) + 1 };
  }
  const nextDayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  return {
    dayStart,
    hours: Math.round((nextDayStart.getTime() - dayStart.getTime()) / HOUR_MS),
    end: new Date(nextDayStart.getTime() - HOUR_MS).toISOString(),
  };
}

const HOUR_DAY_FMT: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };

type Bucket = { key: string; label: string; rangeLabel: string; count: number; from: string; to: string };

// Day/week/month dates come back grouped on the viewer's own calendar (the
// API sends their timezone), so they're local midnights, not UTC ones.
function parseDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const DAY_FMT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const MONTH_FMT: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
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

function bucketDayData(data: ScanDayCount[]): Bucket[] {
  return data.map((d) => {
    const date = parseDay(d.date);
    const to = addLocalDays(date, 1);
    const label = date.toLocaleDateString("en-US", DAY_FMT);
    return { key: d.date, label, rangeLabel: label, count: d.count, from: date.toISOString(), to: to.toISOString() };
  });
}

function bucketWeekData(data: ScanWeekCount[]): Bucket[] {
  return data.map((d) => {
    const start = parseDay(d.week);
    const to = addLocalDays(start, 7);
    const label = start.toLocaleDateString("en-US", DAY_FMT);
    return {
      key: d.week,
      label,
      rangeLabel: `Week of ${label}`,
      count: d.count,
      from: start.toISOString(),
      to: to.toISOString(),
    };
  });
}

function bucketMonthData(data: ScanMonthCount[]): Bucket[] {
  return data.map((d) => {
    const start = parseDay(d.month);
    const to = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const label = start.toLocaleDateString("en-US", MONTH_FMT);
    return { key: d.month, label, rangeLabel: label, count: d.count, from: start.toISOString(), to: to.toISOString() };
  });
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

// What the bars count. Scans drill into the matching listings on click;
// the user series have no admin user list to drill into, so their bars are
// hover-only.
type Series = "scans" | "users-joined" | "returning-users";

const SERIES_TEXT: Record<Series, { column: string; unit: string; empty: string }> = {
  scans: { column: "Listings scanned", unit: "scanned", empty: "No scan activity yet." },
  "users-joined": { column: "Users joined", unit: "joined", empty: "No sign-ups yet." },
  "returning-users": { column: "Returning users", unit: "returning", empty: "No returning users recorded yet." },
};

export function ScanActivityChart({
  title,
  sourceId,
  series = "scans",
}: {
  title: string;
  sourceId?: string;
  series?: Series;
}) {
  const clickable = series === "scans";
  const text = SERIES_TEXT[series];
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<Granularity>("hr");
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  // Which local calendar day the hourly view shows — 0 is today (live up to
  // the current hour), 1 yesterday, and so on via the back/forward arrows.
  const [hourDaysAgo, setHourDaysAgo] = useState(0);
  const hourWin = hourWindow(hourDaysAgo);

  const hourQuery = useQuery({
    queryKey: ["admin", `${series}-by-hour`, sourceId ?? "all", hourDaysAgo, hourWin.hours],
    queryFn: () =>
      series === "returning-users"
        ? adminApi.returningUsersByHour(hourWin.hours, hourWin.end)
        : series === "users-joined"
        ? adminApi.usersJoinedByHour(hourWin.hours, hourWin.end)
        : sourceId
        ? adminApi.crawlSourceScansByHour(sourceId, hourWin.hours, hourWin.end)
        : adminApi.scansByHour(hourWin.hours, hourWin.end),
    enabled: granularity === "hr",
  });
  const dayQuery = useQuery({
    queryKey: ["admin", `${series}-by-day`, sourceId ?? "all"],
    queryFn: () =>
      series === "returning-users"
        ? adminApi.returningUsersByDay(REQUEST_COUNT.day)
        : series === "users-joined"
        ? adminApi.usersJoinedByDay(REQUEST_COUNT.day)
        : sourceId
          ? adminApi.crawlSourceScansByDay(sourceId, REQUEST_COUNT.day)
          : adminApi.scansByDay(REQUEST_COUNT.day),
    enabled: granularity === "day",
  });
  const weekQuery = useQuery({
    queryKey: ["admin", `${series}-by-week`, sourceId ?? "all"],
    queryFn: () =>
      series === "returning-users"
        ? adminApi.returningUsersByWeek(REQUEST_COUNT.week)
        : series === "users-joined"
        ? adminApi.usersJoinedByWeek(REQUEST_COUNT.week)
        : sourceId
        ? adminApi.crawlSourceScansByWeek(sourceId, REQUEST_COUNT.week)
        : adminApi.scansByWeek(REQUEST_COUNT.week),
    enabled: granularity === "week",
  });
  const monthQuery = useQuery({
    queryKey: ["admin", `${series}-by-month`, sourceId ?? "all"],
    queryFn: () =>
      series === "returning-users"
        ? adminApi.returningUsersByMonth(REQUEST_COUNT.month)
        : series === "users-joined"
        ? adminApi.usersJoinedByMonth(REQUEST_COUNT.month)
        : sourceId
        ? adminApi.crawlSourceScansByMonth(sourceId, REQUEST_COUNT.month)
        : adminApi.scansByMonth(REQUEST_COUNT.month),
    enabled: granularity === "month",
  });


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
    if (!clickable) return;
    const params = new URLSearchParams();
    if (sourceId) params.set("sourceId", sourceId);
    params.set("scanFrom", bucket.from);
    params.set("scanTo", bucket.to);
    navigate(`/admin/jobs?${params.toString()}`);
  }

  const loading = { hr: hourQuery, day: dayQuery, week: weekQuery, month: monthQuery }[granularity].isLoading;

  const buckets = useMemo(() => {
    if (granularity === "hr") return hourQuery.data ? bucketHourlyData(hourQuery.data) : [];
    if (granularity === "day") return dayQuery.data ? bucketDayData(dayQuery.data) : [];
    if (granularity === "week") return weekQuery.data ? bucketWeekData(weekQuery.data) : [];
    return monthQuery.data ? bucketMonthData(monthQuery.data) : [];
  }, [granularity, hourQuery.data, dayQuery.data, weekQuery.data, monthQuery.data]);

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
        <div className="scan-chart__title-row">
          <h2 className="admin-section__title">{title}</h2>
          {granularity === "hr" && hourQuery.data && (
            <span className="scan-chart__day-total">
              {hourQuery.data.reduce((sum, h) => sum + h.count, 0).toLocaleString()}
              <span className="scan-chart__day-total-label">
                {text.unit} {hourDaysAgo === 0 ? "today" : `on ${hourWin.dayStart.toLocaleDateString("en-US", HOUR_DAY_FMT)}`}
              </span>
            </span>
          )}
        </div>
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
          {granularity === "hr" && (
            <div className="scan-chart__hour-nav" role="group" aria-label="Change day">
              <button
                type="button"
                className="scan-chart__hour-nav-btn"
                onClick={() => setHourDaysAgo((d) => d + 1)}
                aria-label="Previous day"
              >
                ‹
              </button>
              <span className="scan-chart__hour-nav-day">
                {hourDaysAgo === 0 ? "Today" : hourWin.dayStart.toLocaleDateString("en-US", HOUR_DAY_FMT)}
              </span>
              <button
                type="button"
                className="scan-chart__hour-nav-btn"
                onClick={() => setHourDaysAgo((d) => Math.max(0, d - 1))}
                disabled={hourDaysAgo === 0}
                aria-label="Next day"
              >
                ›
              </button>
            </div>
          )}
          <button type="button" className="scan-chart__table-toggle" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "View chart" : "View table"}
          </button>
        </div>
      </div>

      {loading && <p className="admin-page__hint">Loading…</p>}

      {!loading && buckets.length === 0 && <p className="admin-page__hint">{text.empty}</p>}

      {!loading && buckets.length > 0 && showTable && (
        <div className="scan-chart__table-wrap admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>{text.column}</th>
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
                    className={`scan-chart__hit-target${clickable ? "" : " scan-chart__hit-target--static"}`}
                    tabIndex={0}
                    role={clickable ? "button" : "img"}
                    aria-label={`${bucket.rangeLabel}: ${bucket.count.toLocaleString()} ${text.unit}.${clickable ? " View listings." : ""}`}
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
