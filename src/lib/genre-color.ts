import type { CSSProperties } from "react";

/**
 * Stable per-genre chip colors. Big genres get curated hues; everything else
 * hashes to a deterministic OKLCH hue so the same genre is always the same
 * color, across sessions and pages.
 */

const CURATED_HUE: Record<string, number> = {
  Action: 25, // red-orange
  Adventure: 140, // green
  Comedy: 95, // yellow
  Drama: 330, // magenta
  Fantasy: 285, // violet
  Horror: 355, // blood red
  Mystery: 260, // deep blue
  Romance: 5, // pink
  "Sci-Fi": 215, // cyan
  "Slice of Life": 160, // mint
  Sports: 60, // gold
  Supernatural: 300, // purple
  Thriller: 15, // crimson
};

/** djb2 hash → hue 0–359 for genres without a curated color. */
function genreHue(name: string): number {
  const curated = CURATED_HUE[name];
  if (curated != null) return curated;
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

/** Inline chip tint (dark-theme tuned): translucent fill + readable pastel text. */
export function genreChipStyle(name: string): CSSProperties {
  const hue = genreHue(name);
  return {
    backgroundColor: `oklch(0.65 0.13 ${hue} / 0.15)`,
    color: `oklch(0.85 0.09 ${hue})`,
  };
}
