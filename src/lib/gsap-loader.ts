"use client";

/**
 * GSAP, fetched on demand.
 *
 * GSAP + ScrollTrigger are ~55 KB gzipped, and statically imported they sat in
 * the first-load JS of every page with a `Parallax` or `ScrollReveal` (the
 * anime detail page, the home hero, seasons) — for motion that is purely
 * decorative and only matters once the reader starts scrolling. `@/lib/gsap`
 * is now reached only through the dynamic `import()` below, so it lands in an
 * async chunk that loads as the first scroll-driven component mounts.
 *
 * Content is server-rendered visible either way: until GSAP arrives an element
 * simply isn't animated, and under reduced motion it never is. Once the module
 * is loaded, `withGsap` runs its setup *synchronously* again — inside a layout
 * effect, before paint — so client-side navigations behave exactly as they
 * did with the static import, with no visible-then-hidden flicker.
 */

type GsapModule = typeof import("@/lib/gsap");

let loaded: GsapModule | null = null;
let pending: Promise<GsapModule> | null = null;

export function loadGsap(): Promise<GsapModule> {
  pending ??= import("@/lib/gsap").then(
    (mod) => (loaded = mod),
    (err: unknown) => {
      // Offline or a chunk 404: let the next mount try again.
      pending = null;
      throw err;
    },
  );
  return pending;
}

/** The GSAP module if it has already loaded, else null. Never fetches. */
export function loadedGsap(): GsapModule | null {
  return loaded;
}

/**
 * Run `setup` with GSAP — now if it's loaded, otherwise as soon as it is —
 * and return a cleanup for the effect that called it. A failed load leaves the
 * element plainly visible (never parked at a hidden "from" state).
 */
export function withGsap(
  setup: (mod: GsapModule) => (() => void) | void,
): () => void {
  let cleanup: (() => void) | void;
  let cancelled = false;
  if (loaded) {
    cleanup = setup(loaded);
  } else {
    loadGsap().then(
      (mod) => {
        if (!cancelled) cleanup = setup(mod);
      },
      () => {
        /* decorative: no GSAP, no motion */
      },
    );
  }
  return () => {
    cancelled = true;
    cleanup?.();
  };
}
