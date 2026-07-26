import { describe, expect, it } from "vitest";

/**
 * The mosaic's lens, mirrored from PosterCosmos so the geometry can be checked
 * without a GPU.
 *
 * The whole look depends on the cells staying a gap-free, non-overlapping grid
 * while the one under the cursor swells: a lens that let boundaries cross would
 * render posters on top of each other, and one that didn't pin 0 and 1 would
 * tear the mosaic away from the screen edges. Neither is visible to a
 * typecheck, and both are subtle enough to miss by eye mid-motion.
 */
function fisheye(b: number, f: number, distortion: number): number {
  if (b === f) return f;
  const ahead = b > f;
  const dmax = ahead ? 1 - f : f;
  if (dmax <= 0) return b;
  const d = Math.abs(b - f) / dmax;
  const warped = ((distortion + 1) * d) / (distortion * d + 1);
  return f + (ahead ? 1 : -1) * warped * dmax;
}

const boundaries = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

describe("mosaic fisheye", () => {
  it.each([0, 0.1, 0.5, 0.83, 1])("pins both edges with focus %s", (f) => {
    expect(fisheye(0, f, 3.6)).toBeCloseTo(0, 10);
    expect(fisheye(1, f, 3.6)).toBeCloseTo(1, 10);
  });

  it.each([0, 0.25, 0.5, 0.5001, 0.9, 1])(
    "keeps boundaries strictly ordered at focus %s (no overlapping cells)",
    (f) => {
      const warped = boundaries(24).map((b) => fisheye(b, f, 3.6));
      for (let i = 1; i < warped.length; i++) {
        expect(warped[i]!).toBeGreaterThan(warped[i - 1]!);
      }
    },
  );

  it("stays ordered even at the extreme select-zoom strength", () => {
    const warped = boundaries(24).map((b) => fisheye(b, 0.37, 26));
    for (let i = 1; i < warped.length; i++) {
      expect(warped[i]!).toBeGreaterThan(warped[i - 1]!);
    }
  });

  it("magnifies the focused cell and compresses the far ones", () => {
    const cols = 20;
    const f = 0.5;
    const warped = boundaries(cols).map((b) => fisheye(b, f, 3.6));
    const widths = warped.slice(1).map((b, i) => b - warped[i]!);

    const middle = widths[Math.floor(cols / 2)]!;
    const edge = widths[0]!;
    const flat = 1 / cols;

    expect(middle).toBeGreaterThan(flat); // the lens grew it
    expect(edge).toBeLessThan(flat); // its neighbours paid for it
    expect(middle).toBeGreaterThan(edge * 2);
  });

  it("is the identity at zero distortion, so reduced motion gets an even grid", () => {
    for (const b of boundaries(12)) {
      expect(fisheye(b, 0.5, 0)).toBeCloseTo(b, 10);
    }
  });

  it("conserves total width — the mosaic always fills the viewport", () => {
    const warped = boundaries(30).map((b) => fisheye(b, 0.2, 8));
    const total = warped.slice(1).reduce((s, b, i) => s + (b - warped[i]!), 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
