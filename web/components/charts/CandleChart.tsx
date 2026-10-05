"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Candle = { time: number; open: number; high: number; low: number; close: number; volumeUSD: number };

const PLOT_HEIGHT = 240;
const PAD = 10;
const MAX_BODY = 12;
/** Right-hand gutter for the price labels, so they never cover the newest candles. */
const GUTTER = 76;

/**
 * Price candles: body from open to close, wick from low to high; green when the price
 * closed higher, red when lower. Hover or arrow keys read out one candle; a hidden table
 * lists them all.
 */
export function CandleChart({
  candles,
  formatPrice,
  formatTime,
  label,
}: {
  candles: Candle[];
  formatPrice: (value: number) => string;
  formatTime: (unixSeconds: number) => string;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const n = candles.length;
  const lows = candles.map((c) => c.low).filter((v) => v > 0);
  const highs = candles.map((c) => c.high);
  let min = lows.length > 0 ? Math.min(...lows) : 0;
  let max = highs.length > 0 ? Math.max(...highs) : 1;
  if (max === min) {
    // A flat series still needs a visible band around it.
    min *= 0.98;
    max *= 1.02;
  }
  const y = (value: number) => PAD + ((max - value) / (max - min || 1)) * (PLOT_HEIGHT - 2 * PAD);
  const plotWidth = Math.max(0, width - GUTTER);
  const slot = n > 0 ? plotWidth / n : 0;
  const body = Math.max(1, Math.min(MAX_BODY, slot - 2));
  const centerX = (i: number) => i * slot + slot / 2;

  const indexAt = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / Math.max(1, rect.width - GUTTER)) * n)));
  };

  const shown = active ?? (n > 0 ? n - 1 : null);
  const candle = shown !== null ? candles[shown] : null;
  const change = candle && candle.open > 0 ? (candle.close - candle.open) / candle.open : 0;

  return (
    <figure>
      {/* Readout: the hovered candle, or the latest one. */}
      <div className="mb-3 flex min-h-6 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
        {candle && (
          <>
            <span className="text-ink">{formatTime(candle.time)}</span>
            <span>
              O <span className="tabular text-ink">{formatPrice(candle.open)}</span>
            </span>
            <span>
              H <span className="tabular text-ink">{formatPrice(candle.high)}</span>
            </span>
            <span>
              L <span className="tabular text-ink">{formatPrice(candle.low)}</span>
            </span>
            <span>
              C <span className="tabular text-ink">{formatPrice(candle.close)}</span>
            </span>
            <span className={change >= 0 ? "text-buy" : "text-sell"}>
              {change >= 0 ? "+" : ""}
              {(change * 100).toFixed(2)}%
            </span>
          </>
        )}
      </div>

      <div
        ref={frame}
        role="img"
        aria-label={`${label}. Use the arrow keys to read candles; a table follows.`}
        aria-describedby={tableId}
        tabIndex={0}
        className="relative cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-validator"
        style={{ height: PLOT_HEIGHT }}
        onPointerMove={(e) => setActive(indexAt(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onKeyDown={(e) => {
          if (n === 0) return;
          if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n - 1) - 1));
          else if (e.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? n - 1) + 1));
          else return;
          e.preventDefault();
        }}
      >
        {[max, (max + min) / 2, min].map((tick) => (
          <div key={tick} aria-hidden className="pointer-events-none absolute left-0 border-t border-line" style={{ top: y(tick), right: GUTTER - 8 }}>
            <span className="tabular absolute -top-2 left-full pl-2 text-[11px] leading-4 whitespace-nowrap text-subtle">{formatPrice(tick)}</span>
          </div>
        ))}
        {width > 0 && (
          <svg aria-hidden width={width} height={PLOT_HEIGHT} className="absolute inset-0">
            {active !== null && <line x1={centerX(active)} x2={centerX(active)} y1={0} y2={PLOT_HEIGHT} className="stroke-ink/25" />}
            {candles.map((c, i) => {
              const up = c.close >= c.open;
              const top = y(Math.max(c.open, c.close));
              const height = Math.max(1, Math.abs(y(c.open) - y(c.close)));
              const tone = up ? "fill-buy stroke-buy" : "fill-sell stroke-sell";
              return (
                <g key={c.time} className={`${tone} ${active !== null && active !== i ? "opacity-60" : ""}`}>
                  <line x1={centerX(i)} x2={centerX(i)} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
                  <rect x={centerX(i) - body / 2} y={top} width={body} height={height} rx={Math.min(2, body / 4)} strokeWidth={0} />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Open</th>
            <th scope="col">High</th>
            <th scope="col">Low</th>
            <th scope="col">Close</th>
          </tr>
        </thead>
        <tbody>
          {candles.map((c) => (
            <tr key={c.time}>
              <td>{formatTime(c.time)}</td>
              <td>{formatPrice(c.open)}</td>
              <td>{formatPrice(c.high)}</td>
              <td>{formatPrice(c.low)}</td>
              <td>{formatPrice(c.close)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
