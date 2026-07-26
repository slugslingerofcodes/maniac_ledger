import { describe, expect, it } from "vitest";

import { eyeClockLayout } from "@/components/EyeClockBackdrop";

/**
 * The Eye Clock backdrop's focal cover-crop.
 *
 * Two things must hold on every viewport shape, and neither is visible to a
 * typecheck: the clock has to land on the character's eye (a plain centred
 * crop pushes it off a portrait poster on a wide screen, leaving a glowing
 * dial on the cheek), and the poster must never pull away from an edge and
 * leave a bar of empty background.
 */

// The shipped poster, public/backgrounds/eye-clock.jpg.
const IW = 460;
const IH = 652;
// From the wallpaper's LivelyProperties.json (eyeX 399, eyeY 705 — /1000).
const EYE_X = 0.399;
const EYE_Y = 0.705;

const VIEWPORTS: [number, number][] = [
  [1920, 1080], // desktop
  [1280, 720], // laptop
  [3440, 1440], // ultrawide — the hardest case for a portrait poster
  [800, 1200], // portrait tablet
  [390, 844], // phone
  [652, 460], // landscape, poster's own aspect inverted
];

describe("eyeClockLayout", () => {
  it.each(VIEWPORTS)("keeps the clock on the eye at %ix%i", (vw, vh) => {
    const { left, top, scale, centreX, centreY } = eyeClockLayout(IW, IH, vw, vh);
    // Invert the mapping: the clock centre must be the configured eye point.
    expect((centreX - left) / (IW * scale)).toBeCloseTo(EYE_X, 6);
    expect((centreY - top) / (IH * scale)).toBeCloseTo(EYE_Y, 6);
  });

  it.each(VIEWPORTS)("covers the viewport with no gaps at %ix%i", (vw, vh) => {
    const { left, top, scale } = eyeClockLayout(IW, IH, vw, vh);
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(left + IW * scale).toBeGreaterThanOrEqual(vw - 0.001);
    expect(top + IH * scale).toBeGreaterThanOrEqual(vh - 0.001);
  });

  it.each(VIEWPORTS)("keeps the eye inside the viewport at %ix%i", (vw, vh) => {
    const { centreX, centreY } = eyeClockLayout(IW, IH, vw, vh);
    expect(centreX).toBeGreaterThanOrEqual(0);
    expect(centreX).toBeLessThanOrEqual(vw);
    expect(centreY).toBeGreaterThanOrEqual(0);
    expect(centreY).toBeLessThanOrEqual(vh);
  });

  it("scales the dial with the poster, not the viewport", () => {
    const small = eyeClockLayout(IW, IH, 390, 844);
    const large = eyeClockLayout(IW, IH, 1920, 1080);
    expect(large.radius).toBeGreaterThan(small.radius);
    // Radius is a fixed fraction of the displayed poster width either way.
    expect(large.radius / (IW * large.scale)).toBeCloseTo(
      small.radius / (IW * small.scale),
      6,
    );
  });
});
