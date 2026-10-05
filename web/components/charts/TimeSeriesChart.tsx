"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SeriesPoint = { time: number; value: number };

const PLOT_HEIGHT = 180;
const TOP_PAD = 8;
const BAR_GAP = 2; // surface gap between adjacent bars, in px
const MAX_BAR = 24;
const RADIUS = 4;
/** Right-hand gutter for the value labels, so they never sit on top of the newest data. */
const GUTTER = 52;

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Rounds up to a clean number (whose half is clean too), leaving little empty headroom. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

/** A bar whose data end (top) is rounded and whose baseline end is square. */
function barPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(RADIUS, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${bottom} Z`;
}

/**
 * One series over time, as daily bars (amounts per day) or an area (a level, like
 * liquidity). Single-hue, hairline grid, hover/keyboard readout, and a hidden table so
 * every value is reachable without the pointer.
 */
export function TimeSeriesChart({
  points,
  variant,
  format,
  label,
  formatTime = (t) => fullDayLabel.format(t * 1000),
}: {
  points: SeriesPoint[];
  variant: "bar" | "area";
  format: (value: number) => string;
  /** What is plotted; names the chart for screen readers and the table caption. */
  label: string;
  formatTime?: (unixSeconds: number) => string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  // Draw in real pixels so gaps, radii and bar caps stay exact at any size.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const plotWidth = Math.max(0, width - GUTTER);
  const slot = n > 0 ? plotWidth / n : 0;
  const plot = PLOT_HEIGHT - TOP_PAD;
  const y = (value: number) => TOP_PAD + plot - (Math.max(0, value) / max) * plot;
  const centerX = (i: number) => i * slot + slot / 2;
  const ticks = [max, max / 2, 0];

  const indexAt = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / Math.max(1, rect.width - GUTTER)) * n)));
  };

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${centerX(i)},${y(p.value)}`).join(" ");
  const areaPath = n > 0 ? `${linePath} L${centerX(n - 1)},${PLOT_HEIGHT} L${centerX(0)},${PLOT_HEIGHT} Z` : "";
  const barWidth = Math.max(1, Math.min(MAX_BAR, slot - BAR_GAP));

  const shown = active ?? null;
  const point = shown !== null ? points[shown] : null;
  // Keep the readout inside the frame near either edge.
  const tooltipLeft = shown !== null ? Math.min(Math.max(centerX(shown), 70), Math.max(plotWidth - 40, 70)) : 0;

  return (
    <figure className="relative">
      <div
        ref={frame}
        role="img"
        aria-label={`${label}. Use the arrow keys to read values; a table follows.`}
        aria-describedby={tableId}
        tabIndex={0}
        className="relative cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-validator"
        style={{ height: PLOT_HEIGHT }}
        onPointerMove={(e) => setActive(indexAt(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? (n > 0 ? n - 1 : null))}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (n === 0) return;
          if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n - 1) - 1));
          else if (e.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? n - 1) + 1));
          else if (e.key === "Home") setActive(0);
          else if (e.key === "End") setActive(n - 1);
          else return;
          e.preventDefault();
        }}
      >
        {/* Hairline grid with clean tick values sitting on each line. */}
        {ticks.map((tick) => (
          <div key={tick} aria-hidden className="pointer-events-none absolute left-0 border-t border-line" style={{ top: y(tick), right: GUTTER - 8 }}>
            <span className="tabular absolute -top-2 left-full pl-2 text-[11px] leading-4 text-subtle">{tick === 0 ? "0" : format(tick)}</span>
          </div>
        ))}

        {width > 0 && (
          <svg aria-hidden width={width} height={PLOT_HEIGHT} className="absolute inset-0 overflow-visible">
            {variant === "bar" ? (
              points.map((p, i) => {
                const top = y(p.value);
                const height = PLOT_HEIGHT - top;
                if (height <= 0) return null;
                return (
                  <path
                    key={p.time}
                    d={barPath(i * slot + (slot - barWidth) / 2, top, barWidth, height)}
                    className={`transition-colors duration-150 ${shown === i ? "fill-ink" : "fill-validator"}`}
                  />
                );
              })
            ) : (
              <>
                <path d={areaPath} className="fill-validator/10" />
                <path d={linePath} fill="none" className="stroke-validator" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {variant === "area" && point && shown !== null && (
              <>
                <line x1={centerX(shown)} x2={centerX(shown)} y1={0} y2={PLOT_HEIGHT} className="stroke-ink/30" strokeWidth={1} />
                <circle cx={centerX(shown)} cy={y(point.value)} r={4} className="fill-validator stroke-panel" strokeWidth={2} />
              </>
            )}
          </svg>
        )}

        {point && shown !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-3 py-2 whitespace-nowrap shadow-[0_8px_24px_rgb(27_49_88/0.12)]"
            style={{ left: tooltipLeft }}
          >
            <p className="tabular text-sm font-semibold text-ink">{format(point.value)}</p>
            <p className="text-xs text-muted">{formatTime(point.time)}</p>
          </div>
        )}
      </div>

      {/* Start, middle and end dates under the plot. */}
      {n > 1 && (
        <div aria-hidden className="mt-2 flex justify-between text-[11px] text-subtle" style={{ marginRight: GUTTER }}>
          <span>{dayLabel.format(points[0].time * 1000)}</span>
          {n > 2 && <span>{dayLabel.format(points[Math.floor(n / 2)].time * 1000)}</span>}
          <span>{dayLabel.format(points[n - 1].time * 1000)}</span>
        </div>
      )}

      {/* Screen-reader view of the same values; live readout of the focused point. */}
      <p className="sr-only" aria-live="polite">
        {point ? `${formatTime(point.time)}: ${format(point.value)}` : ""}
      </p>
      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.time}>
              <td>{formatTime(p.time)}</td>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
