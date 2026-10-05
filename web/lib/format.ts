const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(n: number) {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join("");
}

/**
 * Formats a USD price that may be tiny. Leading zeros after the decimal point are
 * collapsed into a subscript count, the convention DEX screeners use:
 * 0.000004995 → "$0.0₅4995".
 */
export function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (value >= 0.001) return `$${value.toPrecision(4)}`;

  const zeros = Math.floor(-Math.log10(value)) - 1;
  const significant = Math.round(value * 10 ** (zeros + 4)); // 4 significant digits
  return `$0.0${toSubscript(zeros)}${significant}`;
}

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const plainUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** "$4.99K", "$1.23M"; small values in full ("$12.34"). */
export function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "$0";
  return Math.abs(value) >= 10_000 ? compactUsd.format(value) : plainUsd.format(value);
}

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** Token amounts: "12.3M", "845.2K", "12.5". */
export function formatAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 10_000) return compactNumber.format(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 });
}

/** Fee in pips (1e-6) to a percentage label: 10_000 → "1%", 12_345 → "1.23%". */
export function formatFee(pips: number) {
  const percent = pips / 10_000;
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** Basis points to a percentage label: 150 → "1.5%". */
export function formatBps(bps: number) {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** "3m ago", "2h ago", "5d ago". */
export function timeAgo(unixSeconds: number, nowSeconds = Date.now() / 1000) {
  const seconds = Math.max(0, Math.floor(nowSeconds - unixSeconds));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** "2:05" for a countdown in seconds. */
export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Duration in seconds to a short label: 180 → "3 min", 90 → "1.5 min", 45 → "45 s". */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  return `${(seconds / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })} min`;
}

/**
 * An amount in a market's quote currency: dollars when the quote is USDC, otherwise the
 * number followed by the quote's symbol ("0.0₅42 EURC").
 */
export function formatQuoted(value: number, quoteSymbol: string, isUsd: boolean, style: "price" | "total" = "price") {
  const usd = style === "price" ? formatPrice(value) : formatUsd(value);
  return isUsd ? usd : `${usd.replace("$", "")} ${quoteSymbol}`;
}
