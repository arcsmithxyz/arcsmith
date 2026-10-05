"use client";

import { PREVIEW_SIZES, type FeeCurves } from "@/lib/hooks/useFeePreview";
import { formatFee } from "@/lib/format";

const WIDTH = 560;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 44 };

/**
 * Fee vs trade size for a block stack: buys at the open, buys later, and a single sell into a
 * quiet pool. Trade size is shown as a share of the pool's depth so the chart holds for any
 * pool size.
 */
export function FeeCurveChart({ curves, loading }: { curves: FeeCurves; loading?: boolean }) {
  const guardDiffers = curves.buyAtOpen.some((v, i) => v !== curves.buyLater[i]);
  const series = [
    ...(guardDiffers ? [{ key: "open", label: "Buy, at the open", values: curves.buyAtOpen, color: "var(--warn)", dash: "5 4" }] : []),
    { key: "buy", label: guardDiffers ? "Buy, after 15 min" : "Buy", values: curves.buyLater, color: "var(--buy)", dash: undefined },
    { key: "sell", label: "Sell", values: curves.sell, color: "var(--sell)", dash: undefined },
  ];

  const maxFee = Math.max(20_000, ...series.flatMap((s) => s.values)) * 1.1;
  const maxSize = PREVIEW_SIZES[PREVIEW_SIZES.length - 1];
  const x = (size: number) => PAD.left + (size / maxSize) * (WIDTH - PAD.left - PAD.right);
  const y = (fee: number) => HEIGHT - PAD.bottom - (fee / maxFee) * (HEIGHT - PAD.top - PAD.bottom);
  const yTicks = [0, maxFee / 2, maxFee].map((v) => Math.round(v / 1000) * 1000);

  return (
    <figure className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Fee by trade size">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)">
              {formatFee(t)}
            </text>
          </g>
        ))}
        {[0, 150_000, 300_000, 450_000, 600_000].map((s) => (
          <text key={s} x={x(s)} y={HEIGHT - 10} textAnchor="middle" fontSize="11" fill="var(--text-subtle)">
            {s / 10_000}%
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(PREVIEW_SIZES[i])},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span className="flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </span>
        <span>Trade size, as a share of pool depth</span>
      </figcaption>
    </figure>
  );
}
