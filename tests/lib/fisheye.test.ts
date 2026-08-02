import { describe, expect, it } from "vitest";

import { fisheye, smoothing } from "@/lib/cosmos-math";

/**
 * The mosaic's lens and easing. Both live in `lib/cosmos-math` precisely so
 * they can be imported here — this file used to keep a hand-copied duplicate of
 * `fisheye`, because `PosterCosmos` builds a WebGL context on import and Node
 * has no answer for that. A mirrored copy can drift from the original without
 * either looking wrong, so it tested nothing after the first edit.
 *
 * The whole look depends on the cells staying a gap-free, non-overlapping grid
 * while the one under the cursor swells: a lens that let boundaries cross would
 * render posters on top of each other, and one that didn't pin 0 and 1 would
 * tear the mosaic away from the screen edges. Neither is visible to a
 * typecheck, and both are subtle enough to miss by eye mid-motion.
 */

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

/**
 * The lens easing. Its whole reason for existing is that the same gesture must
 * feel the same on a 60 Hz desktop and a 144 Hz laptop — a property no
 * typecheck and no amount of looking at one machine can confirm, since the bug
 * it replaces (a fixed per-frame factor) looks perfect on whatever hardware you
 * happen to be developing on.
 */
describe("frame-rate-independent smoothing", () => {
  /** Follow a target from 0 to 1 for `seconds`, stepping at `hz`. */
  function converge(tau: number, hz: number, seconds: number): number {
    const dt = 1 / hz;
    let value = 0;
    for (let t = 0; t < seconds; t += dt) {
      value += (1 - value) * smoothing(tau, dt);
    }
    return value;
  }

  it("lands in the same place at 30, 60, 120 and 144 Hz", () => {
    const reference = converge(0.085, 60, 0.5);
    for (const hz of [30, 120, 144, 240]) {
      // Within a thousandth over half a second: visually indistinguishable,
      // and far tighter than the ~2x spread a fixed per-frame factor gives.
      expect(converge(0.085, hz, 0.5)).toBeCloseTo(reference, 3);
    }
  });

  it("covers ~63% of the distance in exactly one time constant", () => {
    // That is the definition of tau, and it's what makes the constants in
    // PosterCosmos readable as durations rather than magic numbers.
    expect(smoothing(0.085, 0.085)).toBeCloseTo(1 - 1 / Math.E, 10);
  });

  it("never overshoots, however long the frame", () => {
    // A blend factor above 1 would send the lens past its target and snap back.
    for (const dt of [0.001, 0.016, 0.05, 1, 10]) {
      const k = smoothing(0.085, dt);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(1);
    }
  });

  it("treats a zero time constant as an instant snap rather than dividing by zero", () => {
    expect(smoothing(0, 0.016)).toBe(1);
  });
});
