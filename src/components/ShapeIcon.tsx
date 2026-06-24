/**
 * Original, generic pictograms for PokéAPI's 14 body-shape categories —
 * not traced from, or derived from, any specific Pokémon's actual artwork
 * or any Nintendo/Game Freak asset. Each icon depicts the universal
 * structural concept the category name describes (a circle for "ball," a
 * generic four-legged-animal silhouette for "quadruped," a generic
 * person silhouette for "humanoid," etc.) — the same category of generic
 * iconography used in countless unrelated icon sets, drawn fresh for this
 * project. Investigated and confirmed during the same pass that found no
 * open-licensed source for *footprint* icons exists: footprints are
 * inherently tied to ~1025 specific official per-species designs (not a
 * generic concept), so they stay unimplemented — this component only
 * covers the 14-category "shape," which is genuinely generic enough to
 * draw originally.
 */
import type { ReactElement, SVGProps } from "react";

const PATHS: Record<string, ReactElement> = {
  ball: <circle cx="12" cy="12" r="7" />,
  squiggle: <path d="M4 14c2-6 6-8 8-4s6 2 8-4" fill="none" />,
  fish: <path d="M3 12c2-4 8-6 13-4l4 4-4 4c-5 2-11 0-13-4z" />,
  arms: (
    <g fill="none">
      <ellipse cx="12" cy="13" rx="4" ry="6" />
      <path d="M8 9 4 6M16 9l4-3" />
    </g>
  ),
  blob: <path d="M6 8c-3 2-3 7 1 9 4 3 9 3 12-1 3-3 1-8-3-9-3-1-7-1-10 1z" />,
  upright: <rect x="8" y="3" width="8" height="18" rx="4" />,
  legs: (
    <g fill="none">
      <circle cx="12" cy="6" r="3" fill="currentColor" stroke="none" />
      <path d="M9 9h6v6M10 15v6M14 15v6" />
    </g>
  ),
  quadruped: (
    <g fill="none">
      <ellipse cx="12" cy="11" rx="7" ry="4" />
      <circle cx="18" cy="9" r="2" fill="currentColor" stroke="none" />
      <path d="M7 14v5M10 14v5M14 14v5M17 14v5" />
    </g>
  ),
  wings: (
    <g fill="none">
      <ellipse cx="12" cy="14" rx="3" ry="6" fill="currentColor" stroke="none" />
      <path d="M9 11 2 6M15 11l7-5" />
    </g>
  ),
  tentacles: (
    <g fill="none">
      <circle cx="12" cy="6" r="4" fill="currentColor" stroke="none" />
      <path d="M7 9c-1 4-1 8 0 12M11 10c-0.5 4 0 8 1 11M14 10c0.5 4 0 8-1 11M17 9c1 4 1 8 0 12" />
    </g>
  ),
  heads: (
    <g fill="none">
      <circle cx="12" cy="10" r="7" fill="currentColor" stroke="none" />
      <path d="M12 17v3" />
    </g>
  ),
  humanoid: (
    <g fill="none">
      <circle cx="12" cy="5" r="3" fill="currentColor" stroke="none" />
      <path d="M12 8v8M8 11h8M9 22l3-6 3 6" />
    </g>
  ),
  "bug-wings": (
    <g fill="none">
      <ellipse cx="12" cy="13" rx="3" ry="7" fill="currentColor" stroke="none" />
      <ellipse cx="7" cy="10" rx="4" ry="2.5" />
      <ellipse cx="17" cy="10" rx="4" ry="2.5" />
    </g>
  ),
  armor: (
    <g fill="none">
      <path d="M5 10c0-4 3-7 7-7s7 3 7 7v3c0 4-3 7-7 7s-7-3-7-7z" />
      <path d="M5 11h14" />
    </g>
  ),
};

export function ShapeIcon({ shape, ...props }: { shape: string } & SVGProps<SVGSVGElement>) {
  const path = PATHS[shape];
  if (!path) return null;
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="currentColor" {...props}>
      {path}
    </svg>
  );
}
