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
/** If a push never commits (slow RSC, aborted nav), part the doors anyway. */
const STUCK_MS = 6000;

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
    const timer = setTimeout(() => setPhase("idle"), DOOR_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Safety net: never leave the viewport sealed if a push never lands.
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("opening"), STUCK_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (reduce || phase === "idle") return null;

  const shut = phase === "closing";
  const transition = { duration: DOOR_MS / 1000, ease: "easeInOut" as const };

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
        <ShojiArt motif={motif} side="left" />
      </motion.div>
      <motion.div
        initial={{ x: shut ? "101%" : "0%" }}
        animate={{ x: shut ? "0%" : "101%" }}
        transition={transition}
        className="shoji-panel relative h-full w-1/2 overflow-hidden border-l-2 border-[oklch(0.32_0.03_60)]"
      >
        <ShojiArt motif={motif} side="right" />
      </motion.div>
    </div>
  );
}
