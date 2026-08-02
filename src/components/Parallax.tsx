"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import {
  MOTION_CONDITIONS,
  ensureScrollTrigger,
  gsap,
  ScrollTrigger,
} from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Scroll-linked parallax: the wrapped content drifts vertically as the section
 * passes through the viewport, at a fraction of the page's own scroll speed.
 *
 * `scrub: true` ties the tween's playhead directly to scroll position, so the
 * movement tracks the wheel/finger exactly and reverses when you scroll back —
 * the reason this is GSAP rather than Framer Motion.
 *
 * Two things to respect when using it:
 *  - It animates `y`, i.e. a transform. Never wrap a `position: sticky` element
 *    or any ancestor of one — a transformed ancestor becomes the containing
 *    block and sticky silently stops working.
 *  - Give decorative layers `aria-hidden`; parallax on text is a readability
 *    problem, not a feature.
 */
export function Parallax({
  children,
  className,
  /**
   * Total travel in pixels across the section's whole pass through the
   * viewport. Negative drifts up (content appears to lag behind the scroll),
   * positive drifts down. Keep backgrounds subtle — 40–120 reads as depth,
   * beyond that it reads as a bug.
   */
  distance = 80,
  /** Scale applied for the whole pass; >1 gives room for the drift to move into. */
  scale = 1,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    ensureScrollTrigger();

    // matchMedia gives us the reduced-motion branch *and* automatic cleanup:
    // reverting the context removes the tween, its inline styles, and the
    // ScrollTrigger together.
    const mm = gsap.matchMedia();
    mm.add(MOTION_CONDITIONS, (ctx) => {
      if (ctx.conditions?.reduce) return;

      gsap.fromTo(
        el,
        { y: -distance / 2, scale },
        {
          y: distance / 2,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );
    });

    return () => mm.revert();
  }, [distance, scale]);

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}

/**
 * Fine-grained variant: staggers the direct children in as the container
 * enters the viewport, scrubbed against scroll so half-scrolling shows a
 * half-finished reveal. Used for poster rows, where a single block fade makes
 * a 20-item grid feel like one heavy object.
 */
export function ParallaxStagger({
  children,
  className,
  /** Vertical offset each child starts from. */
  offset = 28,
}: {
  children: ReactNode;
  className?: string;
  offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    ensureScrollTrigger();

    const mm = gsap.matchMedia();
    mm.add(MOTION_CONDITIONS, (ctx) => {
      if (ctx.conditions?.reduce) return;

      const items = Array.from(el.children) as HTMLElement[];
      if (items.length === 0) return;

      gsap.fromTo(
        items,
        { opacity: 0, y: offset },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power2.out",
          stagger: 0.04,
          scrollTrigger: {
            trigger: el,
            // Start once the container's top is comfortably inside the fold,
            // and fire once — re-hiding rows on scroll-up is disorienting in a
            // grid you're trying to read.
            start: "top 85%",
            once: true,
          },
        },
      );
    });

    return () => mm.revert();
  }, [offset]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Refresh ScrollTrigger's cached measurements. Call after content that changes
 * page height lands (a grid swapping from skeleton to real cards), or triggers
 * keep firing at the old scroll offsets.
 */
export function refreshScrollTriggers() {
  ScrollTrigger.refresh();
}
