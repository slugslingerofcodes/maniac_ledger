"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Barely-there vertical parallax: children drift downward at a fraction of
 * scroll speed, capped to a couple of rem, so the detail-page hero reads as
 * having depth without ever feeling like it's moving.
 *
 * Direct style writes from a passive scroll listener (no React state — a
 * re-render per scroll frame would be absurd for a decoration). Transform-only,
 * so it never invalidates layout, and it does nothing at all under
 * prefers-reduced-motion.
 */
const FACTOR = 0.08;
const MAX_PX = 24;

export function ParallaxY({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.min(MAX_PX, window.scrollY * FACTOR);
        el.style.transform = `translateY(${y}px)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
