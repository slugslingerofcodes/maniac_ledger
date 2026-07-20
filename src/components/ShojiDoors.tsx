"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

import {
  ShojiArt,
  motifForPath,
  type ShojiMotif,
} from "@/components/shoji-motifs";

/** One panel sweep. Kept short — this sits in front of every navigation. */
const DOOR_MS = 280;
/** Poster doors part slower — the reveal of the world is the moment. */
const WORLD_OPEN_MS = 480;
/** If a push never commits (slow RSC, aborted nav), part the doors anyway. */
const STUCK_MS = 6000;

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
 */
export function ShojiDoors() {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  // When the click came from a poster card heading into a detail page, the
  // doorway is painted with that poster instead of the sumi-e motif — the
  // doors shut on the card's art and part to reveal the world inside it.
  const [posterSrc, setPosterSrc] = useState<string | null>(null);
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
      setPosterSrc(toWorld && img ? img.currentSrc || img.src : null);
      setPhase("closing");
    }

    // Capture phase is essential: React attaches <Link>'s handler at the root
    // in the bubble phase, so a bubble listener here would fire *after* Link
    // had already navigated, and the doors would never play.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [reduce]);

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

  // Doors have finished parting → unmount the overlay.
  useEffect(() => {
    if (phase !== "opening") return;
    const timer = setTimeout(
      () => {
        setPhase("idle");
        setPosterSrc(null);
      },
      posterSrc ? WORLD_OPEN_MS : DOOR_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, posterSrc]);

  // Safety net: never leave the viewport sealed if a push never lands.
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("opening"), STUCK_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (reduce || phase === "idle") return null;

  const shut = phase === "closing";
  // The close always snaps to the click; only the poster reveal lingers.
  const transition = {
    duration: (shut || !posterSrc ? DOOR_MS : WORLD_OPEN_MS) / 1000,
    ease: "easeInOut" as const,
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] flex overflow-hidden"
    >
      <motion.div
        initial={{ x: shut ? "-101%" : "0%" }}
        animate={{ x: shut ? "0%" : "-101%" }}
        transition={transition}
        className="shoji-panel relative h-full w-1/2 overflow-hidden border-r-2 border-[oklch(0.32_0.03_60)]"
      >
        {posterSrc ? (
          <WorldArt src={posterSrc} side="left" />
        ) : (
          <ShojiArt motif={motif} side="left" />
        )}
      </motion.div>
      <motion.div
        initial={{ x: shut ? "101%" : "0%" }}
        animate={{ x: shut ? "0%" : "101%" }}
        transition={transition}
        className="shoji-panel relative h-full w-1/2 overflow-hidden border-l-2 border-[oklch(0.32_0.03_60)]"
      >
        {posterSrc ? (
          <WorldArt src={posterSrc} side="right" />
        ) : (
          <ShojiArt motif={motif} side="right" />
        )}
      </motion.div>
      {/* Light spills out of the parting doors of a poster world. */}
      {posterSrc && !shut ? (
        <motion.div
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: WORLD_OPEN_MS / 1000, ease: "easeOut" }}
          className="absolute inset-y-0 left-1/2 w-48 -translate-x-1/2"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 50%, rgb(255 255 255 / 0.55), transparent 70%)",
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The clicked poster painted across the full doorway: each panel is half the
 * viewport, so an inner layer twice the panel's width carries the whole image
 * and the two halves join at the seam — the same trick the sumi-e motifs use.
 * A faint kumiko lattice and edge vignette keep it reading as a shōji door
 * rather than a bare image.
 */
function WorldArt({ src, side }: { src: string; side: "left" | "right" }) {
  return (
    <div aria-hidden className="absolute inset-0">
      <div
        style={{ backgroundImage: `url(${src})` }}
        className={
          "absolute inset-y-0 w-[200%] bg-cover bg-center " +
          (side === "left" ? "left-0" : "right-0")
        }
      />
      <div className="shoji-lattice absolute inset-0 opacity-35" />
      <div
        className={
          "absolute inset-y-0 w-28 " +
          (side === "left"
            ? "left-0 bg-gradient-to-r from-black/45 to-transparent"
            : "right-0 bg-gradient-to-l from-black/45 to-transparent")
        }
      />
    </div>
  );
}
