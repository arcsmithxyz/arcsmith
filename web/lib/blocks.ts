import { decodeAbiParameters, encodeAbiParameters, type Address, type Hex } from "viem";
import { deployment } from "./config";
import { formatBps, formatDuration, formatFee } from "./format";

/**
 * Blocks describe themselves in the catalog with a small JSON document (usually an inline
 * data: URI). Its `config` list is a schema: the Builder renders one field per entry and
 * ABI-encodes the values in order, so any approved block — native or third-party — gets a
 * settings form without code changes here.
 */
export type ConfigField = {
  key: string;
  type: "uint16" | "uint24" | "uint32";
  label: string;
  /** pips = millionths (10000 = 1%); bps = ten-thousandths (100 = 1%). */
  unit: "pips" | "bps" | "seconds" | "number";
  min: number;
  max: number;
  default: number;
};

export type BlockMetadata = {
  name: string;
  summary: string;
  /** "launch" = new tokens only (e.g. the launch guard); "any" = both lanes. */
  lanes: "launch" | "any";
  config: ConfigField[];
};

export type BlockStatus = "none" | "pending" | "approved" | "rejected" | "retired";
export const BLOCK_STATUSES: BlockStatus[] = ["none", "pending", "approved", "rejected", "retired"];

export type CatalogBlock = {
  address: Address;
  author: Address;
  codehash: Hex;
  status: BlockStatus;
  royaltyBps: number;
  submittedAt: number;
  metadataURI: string;
  metadata: BlockMetadata | null;
  native: boolean;
  kind: BlockKind;
};

/** Icon/visual family. Natives are known by address; others fall back to "custom". */
export type BlockKind = "guard" | "damper" | "burn" | "surge" | "custom";

export function blockKind(address: string): BlockKind {
  if (!deployment) return "custom";
  const a = address.toLowerCase();
  if (a === deployment.guardBlock.toLowerCase()) return "guard";
  if (a === deployment.damperBlock.toLowerCase()) return "damper";
  if (a === deployment.burnBlock.toLowerCase()) return "burn";
  if (a === deployment.surgeBlock.toLowerCase()) return "surge";
  return "custom";
}

export function isNative(address: string) {
  return blockKind(address) !== "custom";
}

/** Parses a block's metadata URI. Supports inline data: URIs; other schemes return null. */
export function parseMetadata(uri: string): BlockMetadata | null {
  const match = /^data:application\/json[^,]*,/.exec(uri);
  if (!match) return null;
  const raw = uri.slice(match[0].length);
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.name === "string" && Array.isArray(parsed?.config)) {
        return {
          name: parsed.name,
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          lanes: parsed.lanes === "launch" ? "launch" : "any",
          config: parsed.config.filter(isConfigField),
        };
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function isConfigField(f: unknown): f is ConfigField {
  const x = f as ConfigField;
  return (
    typeof x?.key === "string" &&
    ["uint16", "uint24", "uint32"].includes(x.type) &&
    typeof x.label === "string" &&
    ["pips", "bps", "seconds", "number"].includes(x.unit) &&
    [x.min, x.max, x.default].every((n) => typeof n === "number")
  );
}

/** Default values for a block's config, in schema order. */
export function defaultValues(meta: BlockMetadata): number[] {
  return meta.config.map((f) => f.default);
}

export function encodeConfig(meta: BlockMetadata, values: number[]): Hex {
  return encodeAbiParameters(
    meta.config.map((f) => ({ type: f.type, name: f.key })),
    meta.config.map((f, i) => values[i] ?? f.default),
  ) as Hex;
}

export function decodeConfig(meta: BlockMetadata, config: Hex): number[] | null {
  try {
    const values = decodeAbiParameters(
      meta.config.map((f) => ({ type: f.type, name: f.key })),
      config,
    );
    return values.map((v) => Number(v));
  } catch {
    return null;
  }
}

/** A config value as people read it: pips and bps become percentages, seconds become minutes. */
export function formatValue(field: ConfigField, value: number) {
  switch (field.unit) {
    case "pips":
      return formatFee(value);
    case "bps":
      return formatBps(value);
    case "seconds":
      return formatDuration(value);
    default:
      return value.toLocaleString("en-US");
  }
}

/** Converts what someone types (a percentage, minutes…) into the stored unit, and back. */
export function toInput(field: ConfigField, value: number) {
  switch (field.unit) {
    case "pips":
      return value / 10_000;
    case "bps":
      return value / 100;
    default:
      return value;
  }
}

export function fromInput(field: ConfigField, input: number) {
  switch (field.unit) {
    case "pips":
      return Math.round(input * 10_000);
    case "bps":
      return Math.round(input * 100);
    default:
      return Math.round(input);
  }
}

export function inputSuffix(field: ConfigField) {
  return field.unit === "pips" || field.unit === "bps" ? "%" : field.unit === "seconds" ? "s" : "";
}

export function validateValues(meta: BlockMetadata, values: number[]): string | null {
  for (const [i, f] of meta.config.entries()) {
    const v = values[i];
    if (!Number.isFinite(v) || v < f.min || v > f.max) {
      return `${meta.name}: ${f.label} must be between ${formatValue(f, f.min)} and ${formatValue(f, f.max)}.`;
    }
  }
  return null;
}

/**
 * One-line plain-language description of a configured native block. Third-party blocks
 * get their summary plus the raw settings.
 */
export function describeBlock(block: Pick<CatalogBlock, "address" | "metadata">, values: number[] | null): string {
  const kind = blockKind(block.address);
  const v = values ?? [];
  switch (kind) {
    case "guard":
      return `Buy fee +${formatFee(v[0] ?? 0)} at the open, falling to nothing over ${formatDuration(v[1] ?? 0)}` +
        ((v[2] ?? 0) > 0 ? `; each buy capped at ${formatBps(v[2])} of supply meanwhile.` : ".");
    case "damper":
      return `Sells pay up to +${formatFee(v[1] ?? 0)} when many sell at once; pressure fades over about an hour.`;
    case "burn":
      return `${formatBps(v[0] ?? 0)} of every buy is burned forever.`;
    case "surge":
      return `Big trades pay up to +${formatFee(v[1] ?? 0)}, scaled by their size against pool depth.`;
    default: {
      const meta = block.metadata;
      if (!meta) return "Unknown block.";
      const settings = meta.config.map((f, i) => `${f.label} ${formatValue(f, v[i] ?? f.default)}`).join(" · ");
      return settings ? `${meta.summary} (${settings})` : meta.summary;
    }
  }
}

/**
 * The Launch guard's frozen settings (GuardBlock config: uint24 premium, uint32 duration,
 * uint16 maxBuyBps): the extra buy fee at the open in pips, how long the guard runs in
 * seconds, and the per-buy cap in basis points of supply. Null if the config doesn't decode.
 */
export function guardSettings(config: Hex) {
  try {
    const [premium, duration, maxBuyBps] = decodeAbiParameters([{ type: "uint24" }, { type: "uint32" }, { type: "uint16" }], config);
    return { premium: Number(premium), duration: Number(duration), maxBuyBps: Number(maxBuyBps) };
  } catch {
    return null;
  }
}

/** The guard's extra buy fee (pips) `elapsed` seconds after the open: falls in a straight line to zero. */
export function guardPremiumAt(settings: { premium: number; duration: number }, elapsed: number) {
  if (elapsed < 0 || elapsed >= settings.duration) return 0;
  return (settings.premium * (settings.duration - elapsed)) / settings.duration;
}

/** Decodes the damper's per-pool state: pressure in ppm of depth, decayed to `now`. */
export function damperPressure(state: Hex, nowSeconds: number) {
  const raw = BigInt(state);
  const pressure = Number(raw & ((1n << 64n) - 1n));
  const updatedAt = Number((raw >> 64n) & ((1n << 40n) - 1n));
  if (updatedAt === 0 || nowSeconds <= updatedAt) return pressure;
  return Math.max(0, pressure - (nowSeconds - updatedAt) * 278);
}
