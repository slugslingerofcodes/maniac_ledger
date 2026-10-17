"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  DOOR_MS,
  SHATTER_MS,
  STUCK_MS,
  WORLD_OPEN_MS,
} from "@/components/doors/timing";
import { motifForPath, type ShojiMotif } from "@/components/shoji-motifs";
import { supportsWebGL } from "@/lib/webgl";

type ShatterComponent = React.ComponentType<{
  src: string;
  durationMs: number;
}>;

type PanelsComponent = React.ComponentType<{
  shut: boolean;
  posterSrc: string | null;
  motif: ShojiMotif;
}>;

/*
 * prefers-reduced-motion, read as external state. This used framer-motion's
 * `useReducedMotion`, which was the only reason the root layout — and so the
 * first-load JS of every route, auth pages included — carried framer-motion.
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const reducedMotionSnapshot = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION).matches;
const serverReducedMotion = () => false;

/** Detail routes whose doors carry the clicked poster — "entering the world". */
const WORLD_PATHS = ["/anime/", "/manga/"];

type Phase = "idle" | "closing" | "opening";

/**
 * Shōji sliding doors over every route change, app-wide (anime + manga + auth).
 *
 * Replaces the old `(app)/template.tsx`, which could only ever play the "open"
 * half: a template re-mounts *after* navigation has already happened, so there
 * is no moment left in which to close. Living in the root layout instead, this
 * survives navigation and can drive the full cycle:
 *
 *   click → close → router.push → route commits → open
 *
 * Navigations we don't initiate (the server-action redirect after signing in)
 * simply arrive at a new pathname, so they play the "open" half on landing.
 * Skipped entirely under reduced motion.
 *
 * The panels themselves (`doors/DoorPanels`, framer-motion) are fetched on
 * idle after hydration rather than shipped in the root layout's first load.
 * Until they arrive — in practice only a click within the first idle moment
 * of a cold load — a link simply navigates without doors; nothing waits on
 * the chunk.
 */
export function ShojiDoors() {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useSyncExternalStore(
    subscribeMotion,
    reducedMotionSnapshot,
    serverReducedMotion,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  // The panels chunk, held in state so its arrival re-renders a door that is
  // already mid-cycle; the ref is what the click handler reads synchronously.
  const [Panels, setPanels] = useState<PanelsComponent | null>(null);
  const panelsReady = useRef(false);
  const panelsRequested = useRef(false);
  // When the click came from a poster card heading into a detail page, the
  // doorway is painted with that poster instead of the sumi-e motif — the
  // doors shut on the card's art and part to reveal the world inside it.
  const [posterSrc, setPosterSrc] = useState<string | null>(null);
  // three.js for the shatter, fetched on demand and kept once loaded. Held in
  // state (not a ref) so its arrival re-renders the doors that are waiting.
  const [Shatter, setShatter] = useState<ShatterComponent | null>(null);
  const shatterRequested = useRef(false);
  const pendingHref = useRef<string | null>(null);
  // The scene painted across the doors, keyed to wherever we're heading — set
  // on click so the close and the open show the same picture.
  const [motif, setMotif] = useState<ShojiMotif>(() => motifForPath(pathname));
  // Tracks the route this component has already reacted to. Comparing it during
  // render is React's sanctioned alternative to setState-in-an-effect, and it
  // makes the first paint a no-op for free (the paths start equal).
  const [seenPath, setSeenPath] = useState(pathname);

  // The route committed — ours (after the close) or one we never initiated,
  // like the server-action redirect after signing in. Either way: part them.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    // A navigation we didn't drive (post-login redirect) never got a motif
    // picked on click, so derive it here. Deterministic, so this stays pure.
    setMotif(motifForPath(pathname));
    if (!reduce && phase !== "opening") setPhase("opening");
  }

  // Shut the doors before an internal navigation, then push once they meet.
  useEffect(() => {
    if (reduce) return;

    /** Pull in the panels. Whoever asks first pays; repeats are free. */
    function loadPanels() {
      if (panelsRequested.current) return;
      panelsRequested.current = true;
      import("@/components/doors/DoorPanels")
        .then((m) => {
          panelsReady.current = true;
          setPanels(() => m.DoorPanels);
        })
        .catch(() => {
          // Offline or chunk 404: links keep working, just without doors.
          // Allow a later hover/click to try again.
          panelsRequested.current = false;
        });
    }

    // Off the critical path, but early: the first idle moment after
    // hydration, well before a typical first click.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(loadPanels, { timeout: 2000 })
        : window.setTimeout(loadPanels, 1);

    /**
     * Pull in the shatter chunk. Deliberately NOT loaded up front: it carries
     * three.js, and most navigations here are plain links that never use it.
     * Whoever asks first pays; everyone after gets it from the module cache.
     */
    function loadShatter() {
      if (shatterRequested.current || !supportsWebGL()) return;
      shatterRequested.current = true;
      import("@/components/doors/PosterShatter")
        .then((m) => setShatter(() => m.PosterShatter))
        .catch(() => {
          /* offline or chunk 404 — the sliding doors still play */
        });
    }

    /** Same-origin destination for an anchor, or null if we shouldn't touch it. */
    // `?.closest?.()` can yield undefined as well as null, so accept both.
    function internalHref(
      anchor: HTMLAnchorElement | null | undefined,
    ): string | null {
      if (!anchor?.getAttribute("href")) return null;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (url.pathname === window.location.pathname) return null;
      return url.pathname + url.search;
    }

    // Hovering a poster link starts the shatter download, so the very first
    // click already has it. Touch has no hover and simply gets it one nav later.
    //
    // It now also warms the *route*. Prefetching on intent matters far more
    // here than in a stock Next app: the doors below hold every navigation for
    // DOOR_MS before `router.push` is even called, so without this the sequence
    // is 280ms of animation and only *then* a round trip. Warming on hover puts
    // the payload in flight before the click, and the animation becomes the
    // cover for work already done rather than latency added in front of it.
    function onPointerOver(event: PointerEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = internalHref(anchor);
      if (href) {
        loadPanels();
        // Next dedupes repeat prefetches of the same href, so pointer noise
        // over a grid costs nothing after the first pass.
        try {
          router.prefetch(href);
        } catch {
          /* prefetch is best-effort; never let it break a hover */
        }
      }
      if (shatterRequested.current) return;
      if (!anchor?.querySelector("img") || !href) return;
      if (WORLD_PATHS.some((p) => href.startsWith(p))) loadShatter();
    }

    function onClick(event: MouseEvent) {
      // Let modified clicks (new tab/window/download) behave natively, and
      // bow out if a React handler already claimed this click.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (!anchor.getAttribute("href")) return;

      const url = new URL(anchor.href, window.location.href);
      // External hosts, and in-page hash/query-only jumps, keep native behavior.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      // No panels yet (a click inside the first idle moment of a cold load):
      // let the link navigate on its own rather than hold it behind doors
      // that can't be drawn.
      if (!panelsReady.current) {
        loadPanels();
        return;
      }

      // Only preventDefault — never stopPropagation. Next's <Link> bails when
      // `defaultPrevented` is set, so this claims the navigation while other
      // click handlers (closing a drawer, etc.) still get to run.
      event.preventDefault();
      pendingHref.current = url.pathname + url.search;
      setMotif(motifForPath(url.pathname));
      // "Enter the world": a card with a poster <img> bound for a detail page
      // paints the doorway with that poster. currentSrc is what actually
      // loaded; fall back to src for cards that haven't finished decoding.
      const img = anchor.querySelector("img");
      const toWorld = WORLD_PATHS.some((p) => url.pathname.startsWith(p));
      const poster = toWorld && img ? img.currentSrc || img.src : null;
      setPosterSrc(poster);
      // Last chance to fetch it — if it lands before the doors finish closing
      // this navigation shatters, otherwise it slides and the next one does.
      if (poster) loadShatter();
      // Start the route fetch NOW rather than in DOOR_MS. `router.push` can't
      // be called yet (it would commit the new page behind open doors), but
      // prefetch has no visual effect, so the payload downloads *during* the
      // close instead of after it. On a touch device, where there was no hover
      // to warm anything, this is the whole difference between the doors
      // hiding the wait and the doors preceding it.
      try {
        router.prefetch(pendingHref.current);
      } catch {
        /* best-effort — the push below is what actually navigates */
      }
      setPhase("closing");
    }

    // Capture phase is essential: React attaches <Link>'s handler at the root
    // in the bubble phase, so a bubble listener here would fire *after* Link
    // had already navigated, and the doors would never play.
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onPointerOver, true);
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle);
      }
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onPointerOver, true);
    };
  }, [reduce, router]);

  // Doors are shutting → push once they've met.
  //
  // Driven by a timer rather than framer-motion's onAnimationComplete on
  // purpose: rAF is paused in a hidden/background tab, so an animation-gated
  // push would simply never fire and the link would be dead (verified — a
  // hidden tab never advances the animation). Timers still run there, so
  // navigation is guaranteed and the animation stays purely decorative.
  useEffect(() => {
    if (phase !== "closing") return;
    const href = pendingHref.current;
    if (!href) return;
    const timer = setTimeout(() => {
      pendingHref.current = null;
      router.push(href);
    }, DOOR_MS);
    return () => clearTimeout(timer);
  }, [phase, router]);

  // A poster reveal upgrades to the WebGL shatter whenever the chunk happens
  // to be loaded; otherwise the panels just slide apart as before.
  const shattering = phase === "opening" && posterSrc !== null && Shatter !== null;

  // Doors have finished parting → unmount the overlay. This timer, not the
  // animation, is what clears the screen: a stalled shatter can never leave
  // the viewport covered.
  useEffect(() => {
    if (phase !== "opening") return;
    const timer = setTimeout(
      () => {
        setPhase("idle");
        setPosterSrc(null);
      },
      shattering ? SHATTER_MS : posterSrc ? WORLD_OPEN_MS : DOOR_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, posterSrc, shattering]);

  // Safety net: never leave the viewport sealed if a push never lands.
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("opening"), STUCK_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (reduce || phase === "idle") return null;

  // The shards start assembled, filling the viewport exactly where the closed
  // doors left the poster — so the panels hand straight over with no seam.
  if (shattering) {
    return <Shatter src={posterSrc!} durationMs={SHATTER_MS} />;
  }

  // Parting doors on a landing that beat the panels chunk: nothing to draw.
  if (!Panels) return null;

  return (
    <Panels shut={phase === "closing"} posterSrc={posterSrc} motif={motif} />
  );
}
