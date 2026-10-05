// Generates the landing page illustrations with OpenAI gpt-image-2 on Replicate and saves
// them to public/art/. Prompts live here so the art can be regenerated or tweaked later.
//
//   REPLICATE_API_TOKEN=... node scripts/generate-art.mjs hero-blocks cloud-a
//   REPLICATE_API_TOKEN=... node scripts/generate-art.mjs --all
//
// Costs money per image (≈ $0.13 at high quality), so pass only the ids you need.
// Outputs are large; the committed files were recompressed with sharp afterwards
// (clouds ≤ 1400px wide, objects 900px, sunset 2048px, webp quality ~86).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ART_OUT_DIR overrides the destination, e.g. for logo concepts that shouldn't ship yet.
const OUT = process.env.ART_OUT_DIR ?? join(dirname(dirname(fileURLToPath(import.meta.url))), "public", "art");
const MODEL = "openai/gpt-image-2";

// Shared look: Trajectory-style stippled illustration in Arc's palette.
const STYLE =
  "Soft pointillist illustration made of countless tiny grainy dots (stipple / risograph grain texture), " +
  "dreamy and airy, gentle light from the upper left. Palette strictly from: pale sky blue #acc6e9, " +
  "lavender mauve #ddd6dd, warm sand yellow #ffcc6f, soft gold #e9a13f, peach clay #c0827a, " +
  "with deep navy #1b3158 only for fine shading. No text, no letters, no logos, no people.";

// For transparent cutouts: without this the model sometimes paints a sky or haze behind the object.
const ISOLATED =
  " Isolated on a fully transparent background: nothing behind the object, no sky, no backdrop, no water, " +
  "no ground plane, no frame, no vignette, no coloured haze. Centered, generous empty margin.";

// Mascot-style marks (in the spirit of chat-app icons like Discord's, but an original character).
const MASCOT_STYLE =
  "Flat vector app icon in the style of a friendly chat-app mascot logo: one bold, rounded, playful white " +
  "silhouette with simple negative-space features, centred on a rounded-square app tile in deep navy #1b3158, " +
  "with at most one small accent in gold #e9a13f. Solid fills only: no gradients, no outlines, no texture, no " +
  "shadows, no 3D. Must stay readable at 16 pixels. An original character, not a game controller. No text, no " +
  "letters unless asked, no mockup, plain off-white #fbf5f0 around the tile.";

// Logo concepts: flat marks meant to be redrawn as clean vectors once one is chosen.
const LOGO_STYLE =
  "Flat vector logo mark, minimal and geometric, bold simple shapes that stay readable at 16 pixels, " +
  "solid fills only (no gradients, no texture, no shadows, no 3D), deep navy #1b3158 as the main colour " +
  "with one accent in gold #e9a13f, centered on a plain off-white #fbf5f0 background, generous margin. " +
  "No text, no letters unless asked, no mockup, just the mark.";

const ASSETS = {
  "logo-arch-blocks": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A round arch built from exactly five chunky rounded blocks (voussoirs) standing on the ground, the " +
      "top centre block (the keystone) in gold and the other four in navy, small even gaps between blocks. " +
      LOGO_STYLE,
  },
  "logo-anvil-arc": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A simple blacksmith's anvil silhouette in navy, with a single clean gold arc (a half circle, like a " +
      "rising sun or a spark trail) sweeping over it. " + LOGO_STYLE,
  },
  "logo-a-monogram": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A monogram of the capital letter A drawn as a tall rounded arch in navy, whose crossbar is replaced by a " +
      "small gold block. Geometric and balanced. The only letter is A. " + LOGO_STYLE,
  },
  "logo-hammer-spark": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A small navy hammer head striking, with gold sparks flying out in a curved arc shape. Very reduced, " +
      "almost an icon. " + LOGO_STYLE,
  },
  "logo-stacked-arcs": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "Three concentric arches stacked inside each other like a rainbow drawn with thick flat bands, outer " +
      "band navy, middle band pale sky blue #acc6e9, inner band gold, sitting on a flat base line. " +
      LOGO_STYLE,
  },
  // Round 2: variations on the arch, plus new directions and two wordmarks.
  "logo-arch-tile": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "An app icon: a navy #1b3158 rounded square tile, and inside it a round arch built from exactly five " +
      "chunky blocks with small even gaps, the four side blocks off-white #fbf5f0 and the top keystone gold. " +
      LOGO_STYLE,
  },
  "logo-arch-sun": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A round arch built from five chunky navy blocks with small even gaps, and a gold half sun rising inside " +
      "the arch's opening, sitting on the ground line, like dawn seen through a gateway. " + LOGO_STYLE,
  },
  "logo-a-blocks": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A capital letter A built from chunky stacked blocks with small even gaps, the two legs in navy and the " +
      "apex block in gold, sturdy and geometric like masonry. The only letter is A. " + LOGO_STYLE,
  },
  "logo-keystone-spark": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A single thick navy arc (half circle) with a gold keystone block set in its top centre, and a small " +
      "four-pointed gold spark just above the keystone. Very reduced. " + LOGO_STYLE,
  },
  "logo-hook-blocks": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold J-shaped hook curve made of five chunky blocks with small even gaps, following the curve, the " +
      "four blocks of the shaft and bend in navy and the tip block in gold. Clean and geometric, not a fishing " +
      "hook, no barb. " + LOGO_STYLE,
  },
  "logo-block-horizon": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A row of five small navy square blocks sitting side by side on a line, with a large gold arc (a half " +
      "circle outline, thick stroke) spanning over the whole row like a bridge or rising sun. " + LOGO_STYLE,
  },
  "wordmark-keystone-i": {
    aspect: "3:2",
    background: "opaque",
    prompt:
      'A wordmark reading exactly "arcsmith" in lowercase, a clean geometric sans serif of medium weight, ' +
      "navy #1b3158, where the dot of the letter i is replaced by a small gold trapezoid keystone block. " +
      "Flat vector, solid fills only, centered on a plain off-white #fbf5f0 background, generous margin. " +
      "Spell it exactly: a r c s m i t h. No other text.",
  },
  "wordmark-arch-a": {
    aspect: "3:2",
    background: "opaque",
    prompt:
      'A wordmark reading exactly "Arcsmith", a clean geometric sans serif of medium weight in navy #1b3158, ' +
      "where the capital A is drawn as a small round arch of five blocks with a gold keystone at the top. " +
      "Flat vector, solid fills only, centered on a plain off-white #fbf5f0 background, generous margin. " +
      "Spell it exactly: A r c s m i t h. No other text.",
  },
  // Round 3: geometric "A" monograms (solid triangle letterforms with a slotted-in block).
  "logo-a-arc-gap": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A drawn as a solid navy triangle with softly rounded corners and no crossbar. " +
      "Its lower right leg is a separate rounded parallelogram block in gold, set apart from the navy body by a " +
      "narrow gap that curves like a quarter arc, as if the block was slotted into place. The only letter is A. " +
      LOGO_STYLE,
  },
  "logo-a-arch-counter": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A drawn as a solid navy triangle with softly rounded corners, where the inner " +
      "hole is a round-topped arch doorway opening at the base between the two legs, and a small gold keystone " +
      "block sits at the top of that arch opening. The only letter is A. " + LOGO_STYLE,
  },
  "logo-a-five-slats": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A with no crossbar: the left leg is one solid navy slanted slab, and the right " +
      "leg is made of exactly five short parallel diagonal slats with even gaps, like stacked blocks, the top " +
      "slat gold and the other four navy. The only letter is A. " + LOGO_STYLE,
  },
  "logo-a-two-slabs": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A made of two thick rounded slabs leaning into each other at the apex with a " +
      "narrow gap between them: the long left slab navy, the shorter right slab gold, slotting in under the " +
      "left one. No crossbar. The only letter is A. " + LOGO_STYLE,
  },
  "logo-a-notch-block": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A drawn as a solid navy triangle with softly rounded corners and a small " +
      "triangular notch cut out of the middle of its base, with a small gold square block floating inside that " +
      "notch like a piece about to click into place. The only letter is A. " + LOGO_STYLE,
  },
  // Round 4: friendly mascot marks, Discord-style.
  "mascot-arch": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute character whose body is a round arch: a smooth dome head with two short sturdy legs like arch " +
      "pillars and an open gap between them, two tall oval eyes cut out of the dome, and a small gold keystone " +
      "sitting on top of its head like a tiny hat. " + MASCOT_STYLE,
  },
  "mascot-block": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute character that is a single chunky rounded-corner block, slightly wider than tall, with two oval " +
      "eyes and a small curved smile cut out of it, and a tiny gold block floating just above one corner like a " +
      "spark of an idea. " + MASCOT_STYLE,
  },
  "mascot-anvil": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute character shaped like a chunky, rounded blacksmith's anvil, with two oval eyes cut out of its " +
      "face and a small gold spark popping above its horn. Soft friendly proportions, no sharp corners. " +
      MASCOT_STYLE,
  },
  "mascot-a": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute character shaped like a capital letter A with very rounded corners and no crossbar, two oval eyes " +
      "cut out near its top, and its right foot a separate small gold rounded block, like a shoe. The only " +
      "letter is A. " + MASCOT_STYLE,
  },
  "mascot-stack": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute little robot made of two stacked rounded blocks: a wide head with a rounded visor-shaped pair of " +
      "eyes cut out of it, on a slightly smaller body, and a single small gold block as an antenna tip. " +
      MASCOT_STYLE,
  },
  "mascot-hook": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A cute round blob character whose tail curls up into a smooth hook shape, one big oval eye and a small " +
      "smile cut out of its body, a tiny gold block resting inside the curl of the hook. " + MASCOT_STYLE,
  },
  "logo-a-folded": {
    aspect: "1:1",
    background: "opaque",
    prompt:
      "A bold geometric capital A made from a single thick flat ribbon folded over at the apex like paper, the " +
      "front face navy and the folded-under part of the right leg showing in gold. Flat two-tone, no shading. " +
      "The only letter is A. " + LOGO_STYLE,
  },
  "hero-blocks": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "A small floating stack of four rounded, softly translucent building blocks, slightly offset like a " +
      "playful tower, one block glowing warm gold from inside, a trail of fine golden sparkle dust drifting " +
      "down and to the left beneath it. Centered, isolated object, generous empty margin. " + STYLE,
  },
  "cloud-a": {
    aspect: "3:2",
    background: "transparent",
    prompt:
      "A single fluffy cumulus cloud, wide and low, its top lit warm sand yellow and peach, its underside " +
      "shaded in lavender and sky blue. Isolated cloud cutout, soft edges, generous empty margin. " + STYLE,
  },
  "cloud-b": {
    aspect: "3:2",
    background: "transparent",
    prompt:
      "A small, round, puffy cloud, compact and tall, lit warm sand and peach on top, lavender and sky blue " +
      "underneath. Isolated cloud cutout, soft edges, generous empty margin. " + STYLE,
  },
  "cloud-c": {
    aspect: "16:9",
    background: "transparent",
    prompt:
      "A long, low, wispy bank of cloud stretching horizontally, thin and airy, lavender and sky blue with " +
      "warm sand highlights along its top edge. Isolated cutout, soft edges, generous empty margin. " + STYLE,
  },
  sunset: {
    aspect: "2048x1152",
    background: "opaque",
    prompt:
      "A wide, calm cloudscape at golden hour seen from above the clouds: a soft sea of stippled clouds across " +
      "the lower third, the sky fading from lavender at the top to warm sand and gold near the horizon, a gentle " +
      "sun glow low in the center. The whole upper half is open, quiet sky. " + STYLE,
  },
  "step-pick": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "Four small rounded translucent blocks (sky blue, lavender, gold, clay) floating in a loose arc, the gold " +
      "one lifted slightly higher with a halo of fine sparkle dust, as if being chosen. Isolated, centered, " +
      "generous empty margin. " + STYLE,
  },
  "step-preview": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "A smooth glowing golden ribbon floating in the air that rises sharply and then settles into gentle " +
      "smaller waves, like a damped wave, resting above a small soft cloud. Isolated, centered, generous empty " +
      "margin. " + STYLE,
  },
  // v1 ("a coin rising out of a pool of water") came back with a painted sky behind it; v2 rings the coin
  // with step-pick's blocks (the rules, locked at launch) and says outright that nothing sits behind it.
  "step-launch": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "A plain unmarked gold coin floating upright at the centre, with four small rounded translucent blocks " +
      "(sky blue, lavender, gold, clay) held in a neat ring around it, each block linked to the next by a thin " +
      "glowing thread, like rules locked in place around a new token, fine gold sparkle dust drifting upward. " +
      STYLE + ISOLATED,
  },
  "trust-capped": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "A translucent glass bell jar gently covering a small warm golden flame, the flame calm and contained. " +
      "Isolated, centered, generous empty margin. " + STYLE,
  },
  "trust-frozen": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "A clear rounded ice cube with a tiny glowing gold block frozen perfectly still inside it, a few tiny " +
      "frost sparkles around. Isolated, centered, generous empty margin. " + STYLE,
  },
  "trust-readable": {
    aspect: "1:1",
    background: "transparent",
    prompt:
      "An open book whose pages are made of soft light and fine dots, with a small round magnifying lens " +
      "resting on the pages, glowing faintly gold. Isolated, centered, generous empty margin. " + STYLE,
  },
};

const token = process.env.REPLICATE_API_TOKEN;
if (!token) throw new Error("Set REPLICATE_API_TOKEN.");

const ids = process.argv.includes("--all") ? Object.keys(ASSETS) : process.argv.slice(2);
if (ids.length === 0) throw new Error(`Pass asset ids: ${Object.keys(ASSETS).join(", ")}`);

async function api(path, init = {}, attempt = 1) {
  const res = await fetch(`https://api.replicate.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json();
  // Replicate throttles hard (burst of 1) while the account holds under $5 of credit: wait and retry.
  if (res.status === 429 && attempt <= 5) {
    const waitSeconds = Number(res.headers.get("retry-after")) || 10;
    await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    return api(path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${body.detail ?? JSON.stringify(body)}`);
  return body;
}

async function generate(id) {
  const asset = ASSETS[id];
  if (!asset) throw new Error(`Unknown asset "${id}"`);
  let prediction = await api(`/models/${MODEL}/predictions`, {
    method: "POST",
    headers: { Prefer: "wait=60" },
    body: JSON.stringify({
      input: {
        prompt: asset.prompt,
        aspect_ratio: asset.aspect,
        background: asset.background,
        quality: "high",
        output_format: "webp",
        output_compression: 90,
        number_of_images: 1,
      },
    }),
  });
  while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    prediction = await api(`/predictions/${prediction.id}`);
  }
  if (prediction.status !== "succeeded") throw new Error(`${id}: ${prediction.status} ${prediction.error ?? ""}`);

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const image = Buffer.from(await (await fetch(url)).arrayBuffer());
  const file = join(OUT, `${id}.webp`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, image);
  console.log(`${id}: saved ${file} (${Math.round(image.length / 1024)} KB)`);
}

// One at a time keeps failures readable and spending predictable.
for (const id of ids) await generate(id);
