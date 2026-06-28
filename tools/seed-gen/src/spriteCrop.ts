/**
 * Computes a sprite's own non-transparent content region, as fractions
 * (0..1) of its full canvas — used to let the frontend "zoom in" sprites
 * that are disproportionately padded compared to official artwork.
 * Initially built for decorative cosmetic sprites (Unown's letters,
 * Arceus's types, Genesect's Drives, ...) sourced from PokéAPI
 * `pokemon-form` resources, which only ever expose the small (e.g. 96x96)
 * basic battle sprite — confirmed live there's no official-artwork/home
 * variant for any of them. Generalized to every `pokemon`-row sprite too
 * (fetchPokeapi.ts's `shared` object, used by every variety): bestSprite()'s
 * own fallback chain (official-artwork -> home -> the same small basic
 * sprite) means any species/variety that ever lacks official-artwork/home
 * sprites would hit the identical bug, even though none currently do.
 *
 * A single uniform CSS zoom can't safely fix this: how much padding a basic
 * sprite has varies wildly by species — confirmed live by direct pixel
 * inspection (Unown B's actual content fills only ~23%x33% of its 96x96
 * canvas; Arceus's Fire form already fills ~71%x76%). Zooming enough to fix
 * Unown would clip Arceus's edges off. Computing each sprite's REAL content
 * box mechanically (no per-species hand-tuning) is the only way to zoom
 * every sprite in by exactly the right amount.
 */
import path from "node:path";
import { PNG } from "pngjs";
import { CACHE_ROOT, fetchWithRetry, readCache, sanitizeKey, writeCache } from "./httpCache.js";

export interface SpriteCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Safe fallback — "no crop," the entire canvas — for an empty/fetch-failed sprite (shouldn't happen for any real PokéAPI sprite URL, but a render-time consumer should never see a zero-size crop). */
export const FULL_CANVAS_CROP: SpriteCrop = { x: 0, y: 0, width: 1, height: 1 };

/** Scans the raw RGBA buffer for the bounding box of every pixel with a non-zero alpha channel. */
export function computeAlphaBbox(png: { width: number; height: number; data: Uint8Array | Buffer }): SpriteCrop {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return FULL_CANVAS_CROP;
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
}

/** Disk-cached by sprite URL (httpCache.ts's sanitizeKey, shared so a future Unicode-collision case can't recur independently here) — re-running the pipeline only re-downloads/decodes sprites not already cached. */
export async function cachedSpriteCrop(url: string): Promise<SpriteCrop> {
  if (!url) return FULL_CANVAS_CROP;
  const file = path.join(CACHE_ROOT, "sprite-crop", `${sanitizeKey(url)}.json`);
  const cached = await readCache<SpriteCrop>(file);
  if (cached !== undefined) return cached;

  const buffer = await fetchWithRetry(url, async (res) => Buffer.from(await res.arrayBuffer()));
  const png = PNG.sync.read(buffer);
  const crop = computeAlphaBbox(png);
  await writeCache(file, crop);
  return crop;
}
