/**
 * Pure geometry and easing for the /cosmos mosaic.
 *
 * Split out of `PosterCosmos` so it can be tested without a GPU: that component
 * constructs a WebGL context at import time, which Node has no answer for. The
 * test suite used to keep a hand-copied duplicate of `fisheye` for exactly this
 * reason — a mirror that could drift from the original without either copy
 * looking wrong.
 */

/**
 * Graphical fisheye (Sarkar–Brown): redistributes a normalised boundary `b`
 * around focus `f`, leaving 0 and 1 pinned. Applied separably to the column and
 * row boundaries, so cells stay a gap-free grid — the cell under the cursor
 * grows and its neighbours compress to make room, rather than overlapping.
 */
export function fisheye(b: number, f: number, distortion: number): number {
  if (b === f) return f;
  const ahead = b > f;
  const dmax = ahead ? 1 - f : f;
  if (dmax <= 0) return b;
  const d = Math.abs(b - f) / dmax;
  const warped = ((distortion + 1) * d) / (distortion * d + 1);
  return f + (ahead ? 1 : -1) * warped * dmax;
}

/**
 * Frame-rate-independent exponential smoothing.
 *
 * Returns the blend factor that moves a value toward its target with time
 * constant `tau` (seconds to cover ~63% of the remaining distance) over an
 * elapsed `dt`.
 *
 * The naive alternative — a fixed per-frame factor like `x += (target - x) *
 * 0.16` — silently couples the animation's speed to the refresh rate: the same
 * gesture settles twice as fast on a 120 Hz display as on a 60 Hz one, and
 * lurches whenever a frame runs long. Deriving the factor from real elapsed
 * time makes the feel identical everywhere and lets a dropped frame catch up
 * instead of falling behind.
 */
export function smoothing(tau: number, dt: number): number {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-dt / tau);
}
