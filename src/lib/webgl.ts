/**
 * Shared WebGL capability probe.
 *
 * Creating a GL context is expensive, so the answer is computed once per page
 * load and memoised. Both the cosmos and the poster-door shatter gate on this;
 * without it a machine with no GPU acceleration gets a blank canvas where a
 * transition should be.
 */
let cached: boolean | null = null;

export function supportsWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    cached = Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    cached = false;
  }
  return cached;
}
