"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { MOTION_CONDITIONS, ensureScrollTrigger, gsap } from "@/lib/gsap";

const OFFSETS = {
  up: { x: 0, y: 40 },
  left: { x: -48, y: 0 },
  right: { x: 48, y: 0 },
} as const;

export type RevealDirection = keyof typeof OFFSETS;

/**
 * Scroll-driven slide transition: the wrapped section slides and fades in as it
 * enters the viewport and back out as it leaves, so moving down the page feels
 * like stepping through slides.
 *
 * Runs on GSAP ScrollTrigger (it used to be Framer Motion's `whileInView`).
 * The difference that matters: `toggleActions` re-plays the reveal in both
 * directions off real scroll position, where `whileInView` fired on a single
 * intersection threshold and could leave a tall section stuck hidden. Inert
 * under reduced motion — content renders plainly, never hidden.
 *
 * Don't wrap anything `position: sticky` (or an ancestor of it): the transform
 * this animates would become the sticky element's containing block.
 */
export function ScrollReveal({
  children,
  className,
  direction = "up",
  amount = 0.15,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Fraction of the viewport height the section's top must reach before it
   * slides in. Keep small for sections taller than the viewport.
   */
  amount?: number;
  direction?: RevealDirection;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    ensureScrollTrigger();

    const mm = gsap.matchMedia();
    mm.add(MOTION_CONDITIONS, (ctx) => {
      // Reduced motion: return before the tween is created, so no `from`
      // values are ever written and the content renders plainly visible.
      if (ctx.conditions?.reduce) return;

      const { x, y } = OFFSETS[direction];
      gsap.fromTo(
        el,
        { opacity: 0, x, y },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration: 0.6,
          delay,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            // `amount` is a fraction of the section; express it as the point in
            // the viewport its top must cross, so a 0.15 threshold still fires
            // for a section three screens tall.
            start: `top ${Math.round(100 - amount * 100)}%`,
            // enter / leave / enterBack / leaveBack — reverses on the way out,
            // matching the old `viewport.once: false` behaviour.
            toggleActions: "play reverse play reverse",
          },
        },
      );
    });

    return () => mm.revert();
  }, [direction, amount, delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
