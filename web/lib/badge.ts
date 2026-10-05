import { hookReach, isAddress, type ReachLevel } from "./permissions";

/**
 * The "hook check" badge: a small SVG a project, wallet or explorer can embed to show what a
 * hook's address allows it to do. It shows capabilities only, never a verdict, so it has no
 * "safe" wording and no green: a hook that can't move money still isn't an endorsement.
 */

const NAVY = "#1b3158";
/** Fill by reach: warm for what can move money, quiet for the rest. */
export const REACH_FILL: Record<ReachLevel, { background: string; text: string }> = {
  changes_amounts: { background: "#e9a13f", text: NAVY },
  can_refuse: { background: "#ffcc6f", text: NAVY },
  informational: { background: "#ddd6dd", text: NAVY },
  none: { background: "#ddd6dd", text: NAVY },
};

const LABEL = "hook check";
const HEIGHT = 20;
const FONT_SIZE = 11;
/** Rough width of one character at this size, a little generous so a wide font still fits. `textLength` below pins the text to its box. */
const CHAR_WIDTH = 6.7;
const PADDING = 10;

/** The badge for a hook address, or a grey "invalid address" badge when it isn't one. */
export function hookBadge(address: string) {
  if (!isAddress(address)) return badge("invalid address", "#ddd6dd", NAVY);
  const reach = hookReach(address);
  const fill = REACH_FILL[reach.level];
  return badge(reach.label, fill.background, fill.text);
}

function badge(value: string, background: string, text: string) {
  const left = Math.round(LABEL.length * CHAR_WIDTH) + PADDING * 2;
  const right = Math.round(value.length * CHAR_WIDTH) + PADDING * 2;
  const width = left + right;
  const title = `Arcsmith ${LABEL}: ${value}`;
  // Plain SVG with no script and no external references, so it is safe to serve from our origin.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${title}">
<title>${title}</title>
<clipPath id="r"><rect width="${width}" height="${HEIGHT}" rx="4"/></clipPath>
<g clip-path="url(#r)">
<rect width="${left}" height="${HEIGHT}" fill="${NAVY}"/>
<rect x="${left}" width="${right}" height="${HEIGHT}" fill="${background}"/>
</g>
<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_SIZE}" text-anchor="middle">
<text x="${left / 2}" y="14" fill="#ffffff" textLength="${left - PADDING * 2}" lengthAdjust="spacingAndGlyphs">${LABEL}</text>
<text x="${left + right / 2}" y="14" fill="${text}" textLength="${right - PADDING * 2}" lengthAdjust="spacingAndGlyphs">${value}</text>
</g>
</svg>`;
}
