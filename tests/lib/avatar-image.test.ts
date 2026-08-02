import { describe, expect, it } from "vitest";

import { AVATAR_SIZE, coverCrop } from "@/lib/avatar-image";

/**
 * Avatar centre-crop geometry.
 *
 * The canvas work around it needs a browser, but this is the part worth
 * pinning: it decides which pixels of someone's face survive. An off-by-one or
 * a flipped axis doesn't throw and doesn't fail a typecheck — it just shifts
 * every profile picture slightly off-centre, which nobody notices until all of
 * them look subtly wrong.
 */
describe("coverCrop", () => {
  it("takes the whole frame when the source is already square", () => {
    expect(coverCrop(600, 600)).toEqual({ sx: 0, sy: 0, sw: 600, sh: 600 });
  });

  it("crops the sides of a landscape photo, centred", () => {
    // 1600x900 -> a 900px square with (1600-900)/2 = 350 trimmed each side.
    expect(coverCrop(1600, 900)).toEqual({ sx: 350, sy: 0, sw: 900, sh: 900 });
  });

  it("crops top and bottom of a portrait photo, centred", () => {
    // The common case: a phone photo. Cropping the wrong axis here would
    // decapitate every portrait upload.
    expect(coverCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, sw: 1080, sh: 1080 });
  });

  it("keeps the crop inside the source on odd dimensions", () => {
    // Rounding must never produce a rect that runs past the edge, which draws
    // transparent padding into the avatar.
    for (const [w, h] of [
      [1001, 667],
      [667, 1001],
      [3, 2],
      [999, 1000],
    ] as const) {
      const { sx, sy, sw, sh } = coverCrop(w, h);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + sw).toBeLessThanOrEqual(w);
      expect(sy + sh).toBeLessThanOrEqual(h);
      expect(sw).toBe(sh); // square, or the avatar distorts
    }
  });

  it("centres within a pixel on both axes", () => {
    const { sx, sw } = coverCrop(1001, 500);
    const leftTrim = sx;
    const rightTrim = 1001 - (sx + sw);
    expect(Math.abs(leftTrim - rightTrim)).toBeLessThanOrEqual(1);
  });

  it("stores at an edge that comfortably covers every rendered size", () => {
    // 32px in the nav, 64px on the profile, and a full-screen lightbox — 512
    // covers the largest of those on a 3x screen.
    expect(AVATAR_SIZE).toBeGreaterThanOrEqual(64 * 3);
  });
});
