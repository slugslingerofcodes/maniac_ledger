"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Single place GSAP is configured.
 *
 * Division of labour in this app: **GSAP owns scroll-driven motion** (parallax,
 * scrubbed reveals), because ScrollTrigger can tie a timeline's playhead to
 * scroll position — something Framer Motion's `whileInView` can only
 * approximate with a fire-once threshold. **Framer Motion keeps UI state
 * transitions** (drawer, dialogs, list add/remove, layout animations), where
 * its `AnimatePresence`/`layout` model is the better fit. Don't drive the same
 * CSS property from both on one element.
 */

let registered = false;

/**
 * Register ScrollTrigger, once, lazily.
 *
 * Deliberately *not* done at module scope: registration reaches for
 * `window.matchMedia` immediately, which explodes in any environment that
 * imports this module before a DOM exists (SSR, and jsdom tests that install
 * their `matchMedia` stub in `beforeEach`). Callers invoke this from inside an
 * effect, by which point the browser is real.
 */
export function ensureScrollTrigger() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

/**
 * Media conditions for `gsap.matchMedia()`.
 *
 * Two keys, both load-bearing. `all` is GSAP's special always-true condition,
 * which is what makes the callback run at all — a context whose every query is
 * false is simply never invoked, so keying only on `reduce` would silently skip
 * the animation for everyone *except* users who asked for less of it.
 * `reduce` then lands in `context.conditions` for the callback to branch on.
 *
 * Phrased as "reduce" rather than "no-preference" so the default — no
 * preference expressed, or a browser that doesn't report one — is the animated
 * path, and only an explicit request opts out.
 */
export const MOTION_CONDITIONS = {
  all: "all",
  reduce: "(prefers-reduced-motion: reduce)",
} as const;

export { gsap, ScrollTrigger };
