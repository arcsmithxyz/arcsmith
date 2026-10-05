/**
 * Prepares a token image in the browser before it's uploaded: centre-cropped to a square,
 * scaled to at most 512 px and re-encoded. That keeps uploads small, strips any metadata
 * (camera location and the like), and turns every format into one the server accepts.
 */

const SIZE = 512;
const MIN_SIDE = 64;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Stay under the server's 512 KB limit (lib/server/media.ts) with room to spare. */
const MAX_OUTPUT_BYTES = 450 * 1024;

export const TOKEN_IMAGE_ACCEPT = ACCEPTED.join(",");

export async function prepareTokenImage(file: File): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Use an image under 10 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be read.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  if (side < MIN_SIDE) throw new Error(`Use an image at least ${MIN_SIDE} px on each side.`);

  const size = Math.min(SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare images.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  // WebP where the browser can encode it; Safari can't and hands back PNG, which can be large
  // for photos, so fall back to JPEG then, flattened onto the site's background colour.
  const webp = await encode(canvas, "image/webp", 0.9);
  if (webp.type === "image/webp" && webp.size <= MAX_OUTPUT_BYTES) return webp;
  const png = webp.type === "image/png" ? webp : await encode(canvas, "image/png");
  if (png.size <= MAX_OUTPUT_BYTES) return png;
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#fbf5f0";
  context.fillRect(0, 0, size, size);
  return encode(canvas, "image/jpeg", 0.88);
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be encoded."))), type, quality),
  );
}

/** Uploads a prepared image and returns its permanent URL. */
export async function uploadTokenImage(image: Blob): Promise<string> {
  const response = await fetch("/api/media", { method: "POST", body: image, headers: { "content-type": image.type } });
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? "The image upload failed. Try again.");
  return body.url;
}
