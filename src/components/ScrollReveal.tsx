"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const OFFSETS = {
  up: { x: 0, y: 40 },
  left: { x: -48, y: 0 },
  right: { x: 48, y: 0 },
} as const;

export type RevealDirection = keyof typeof OFFSETS;

/**
 * Scroll-driven slide transition: the wrapped section slides and fades in as
 * it enters the viewport and back out as it leaves (`viewport.once` is
 * deliberately off), so moving down the page feels like stepping through
 * slides. Inert under reduced motion — content renders plainly, never hidden.
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
  direction?: RevealDirection;
  /**
   * Fraction of the section that must be visible before it slides in. Keep
   * small for sections taller than the viewport — a long list can never reach
   * a high fraction and would stay hidden forever.
   */
  amount?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  const { x, y } = OFFSETS[direction];
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ amount }}
      transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
