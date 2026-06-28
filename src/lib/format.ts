/** Parses the JSON-encoded arrays models.rs stores for types/egg_groups/boost_requirements/abilities. Defaults to string[] (most columns); pass a type param for richer shapes (e.g. abilities). */
export const parseJsonArray = <T = string>(value: string): T[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Shape stored in the pokemon table's `abilities` JSON column — see fetchPokeapi.ts. */
export interface PokemonAbility {
  name: string;
  isHidden: boolean;
}

/** odds_* fields are denominators — 4096 means "1 in 4096", never a raw probability. */
export const formatOdds = (denominator: number): string => `1/${denominator.toLocaleString()}`;

/** gender_rate: -1 genderless, 0 always male, 8 always female, else eighths female. */
export const formatGenderRate = (rate: number): string => {
  if (rate === -1) return "Genderless";
  if (rate === 0) return "Male only";
  if (rate === 8) return "Female only";
  return `${Math.round((rate / 8) * 100)}% female`;
};

/** Duck-typed instead of `instanceof Error` — rejections from tauri.ts wrappers can cross module/realm boundaries during HMR. */
export const errorMessage = (err: unknown): string | null => {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return null;
};

/** A sprite's own non-transparent content region, as fractions (0..1) of its canvas — see CosmeticForm.sprite_crop_x's own doc comment for why this exists. {x:0,y:0,width:1,height:1} ("the full canvas") is the correct no-op value for any sprite that's already tightly cropped (official artwork). */
export interface SpriteCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CANVAS_CROP: SpriteCrop = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The crop's dominant axis fills this fraction of the box, not 100% of it —
 * confirmed via a direct pixel-level simulation (Hisuian Lilligant, whose
 * measured height fraction is 0.848, the dominant axis) that a literal 100%
 * fill makes the topmost/bottommost real content pixel land exactly on the
 * box's edge with zero margin, which reads as visually clipped even though
 * every alpha>0 pixel is genuinely included — true for ANY crop by
 * construction of the `1/max(width,height)` scale, not unique to one
 * species. A uniform margin (not a per-species tweak) gives every sprite
 * the same small breathing room the rest of the UI already has around it.
 * An initial 0.92 (an 8% total margin, ~4% per side) measured out to only
 * ~13px of breathing room on a 320px tile for Hisuian Lilligant — visually
 * still read as cropped, confirmed by re-measuring the actual rendered
 * margin in pixels, not just eyeballing a render. 0.85 (~7.5% per side)
 * doubles that to a margin that's actually visible at typical tile sizes.
 */
const CROP_FILL_FRACTION = 0.85;

/**
 * A CSS `transform` value that zooms a sprite `<img>` in so its own real
 * content (per `crop`) fills its box, derived purely from the crop
 * fractions — no per-species tuning. Math: scale by
 * `CROP_FILL_FRACTION/max(width,height)` (so the crop's larger dimension
 * fills CROP_FILL_FRACTION of the box, leaving a small margin instead of
 * touching the edge, without clipping the other axis), then translate the
 * crop's center to the box's center. CSS applies the rightmost transform
 * function to the point first, so `scale` is listed after `translate` even
 * though it conceptually happens first; percentages in `translate()`
 * resolve against the element's own untransformed border-box size,
 * independent of the `scale()` alongside it, which keeps this exact
 * regardless of the `<img>`'s rendered size. The host `<img>` needs an
 * `overflow-hidden` wrapper sized to match it — this only computes the
 * zoom, it doesn't clip anything itself.
 */
export function spriteCropTransform(crop: SpriteCrop): string {
  if (crop.width <= 0 || crop.height <= 0) return "none";
  const scale = CROP_FILL_FRACTION / Math.max(crop.width, crop.height);
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const translateXPercent = scale * (0.5 - centerX) * 100;
  const translateYPercent = scale * (0.5 - centerY) * 100;
  return `translate(${translateXPercent}%, ${translateYPercent}%) scale(${scale})`;
}
