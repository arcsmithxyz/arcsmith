import type { BlockKind } from "./blocks";

/**
 * Starting points for the builder, each written as the sentence a creator would say. Opening
 * /build?preset=<id> loads its base fee and blocks; every setting stays editable before launch.
 * Values are in the builder's own units (percent for fees and shares, seconds for durations);
 * settings left out keep the block's default.
 */
export type Preset = {
  id: string;
  says: string;
  /** Short name shown with the result. */
  title: string;
  baseFee: string;
  blocks: { kind: Exclude<BlockKind, "custom">; settings?: Record<string, number> }[];
};

export const PRESETS: Preset[] = [
  {
    id: "fair-launch",
    says: "Make snipers pay at the open, and slow down dumps after.",
    title: "Fair launch",
    baseFee: "1",
    blocks: [{ kind: "guard" }, { kind: "damper" }],
  },
  {
    id: "sniper-shield",
    says: "Stop bots from buying up the launch in its first 5 minutes.",
    title: "Sniper shield",
    baseFee: "1",
    blocks: [{ kind: "guard", settings: { duration: 300, maxBuyBps: 0.5 } }],
  },
  {
    id: "deflationary",
    says: "Burn a slice of every buy, forever.",
    title: "Deflationary",
    baseFee: "1",
    blocks: [{ kind: "guard" }, { kind: "burn", settings: { burnBps: 1 } }],
  },
  {
    id: "calm-exits",
    says: "Make panic selling expensive, not impossible.",
    title: "Calm exits",
    baseFee: "1",
    blocks: [{ kind: "damper", settings: { maxSurcharge: 9 } }],
  },
  {
    id: "whale-fee",
    says: "Charge big trades more, and pay it to liquidity providers.",
    title: "Whale fee",
    baseFee: "0.5",
    blocks: [{ kind: "surge" }, { kind: "damper" }],
  },
  {
    id: "plain",
    says: "Just a simple pool with a 0.3% fee.",
    title: "Plain pool",
    baseFee: "0.3",
    blocks: [],
  },
];

export function presetById(id: string | null) {
  return PRESETS.find((p) => p.id === id) ?? null;
}
