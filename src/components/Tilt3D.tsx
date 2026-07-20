"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Collectible-card 3D tilt: the wrapped content rotates toward the pointer on
 * a spring, while a specular sheen (white core with a faint violet→cyan
 * iridescence, matching the primary/chart tokens) sweeps across the surface.
 *
 * Pointer tracking only arms on hover-capable, motion-safe devices
 * (`(hover: hover) and (pointer: fine)` and not `prefers-reduced-motion`);
 * everywhere else — touch, reduced motion, jsdom — this renders as an inert
 * wrapper and the content keeps its static hover states. The element type
 * never changes between the two states, so arming after hydration doesn't
 * remount the children (posters would re-decode).
 */
export function Tilt3D({
  children,
  className,
  glareClassName,
  maxTilt = 9,
  scale = 1.03,
  shadow = false,
}: {
  children: ReactNode;
  className?: string;
  /** Border radius for the sheen overlay — match the card inside. */
  glareClassName?: string;
  /** Peak rotation in degrees at the card's edges. */
  maxTilt?: number;
  /** Hover scale; 1 disables the grow. */
  scale?: number;
  /** Dynamic drop shadow that shifts opposite the tilt (hero poster). */
  shadow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // jsdom has no matchMedia; stay inert there and on odd embedders.
    if (typeof window.matchMedia !== "function") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !reduced.matches);
    update();
    fine.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  // Pointer position over the card, 0..1 on each axis; 0.5/0.5 is flat rest.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 260, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), spring);
  const cardScale = useSpring(1, spring);

  // Specular sheen follows the pointer; fades in/out on enter/leave.
  const glareX = useTransform(px, (v) => v * 100);
  const glareY = useTransform(py, (v) => v * 100);
  const glareOpacity = useSpring(0, { stiffness: 200, damping: 30 });
  const glareBackground = useMotionTemplate`radial-gradient(farthest-corner circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.32) 0%, oklch(0.7 0.17 285 / 0.14) 28%, oklch(0.75 0.12 215 / 0.1) 48%, transparent 68%)`;

  // Light comes from the sheen, so the shadow slides the opposite way.
  const shadowX = useTransform(rotateY, (v) => v * -1.4);
  const shadowY = useTransform(rotateX, (v) => v * 1.4);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 36px -8px rgb(0 0 0 / 0.5)`;

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
    glareOpacity.set(1);
    cardScale.set(scale);
  }

  function onPointerLeave() {
    px.set(0.5);
    py.set(0.5);
    glareOpacity.set(0);
    cardScale.set(1);
  }

  return (
    <motion.div
      ref={ref}
      className={cn("relative [transform-style:preserve-3d]", className)}
      style={{
        rotateX,
        rotateY,
        scale: cardScale,
        transformPerspective: 900,
        ...(shadow && enabled ? { boxShadow } : null),
      }}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerLeave={enabled ? onPointerLeave : undefined}
    >
      {children}
      {enabled ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-10 rounded-xl mix-blend-overlay",
            glareClassName,
          )}
          style={{ background: glareBackground, opacity: glareOpacity }}
        />
      ) : null}
    </motion.div>
  );
}
