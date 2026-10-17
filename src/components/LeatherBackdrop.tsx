/**
 * Full-bleed blue leather surface — the plain counterpart to `ImageBackdrop`.
 *
 * Same contract as that component: a `-z-10` layer that fills either the
 * viewport (`fixed`) or its nearest positioned ancestor, so a page swaps one
 * for the other without touching its own layout. The texture itself is
 * generated in CSS (`.bg-leather-blue` in `globals.css`), so this ships no
 * asset and stays sharp at any resolution.
 *
 * No scrim by default, unlike `ImageBackdrop`: the leather is already dark and
 * low-contrast, and veiling it further only muddies the grain. Pass `overlay`
 * if a page puts dense text straight onto it.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function LeatherBackdrop({
  fixed = false,
  overlay,
  className,
}: {
  fixed?: boolean;
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none inset-0 -z-10 overflow-hidden",
        fixed ? "fixed" : "absolute",
        className,
      )}
    >
      <div className="bg-leather-blue absolute inset-0" />
      {/* Edge falloff: a flat rectangle of texture reads as wallpaper, a
          darkened border reads as a bound surface with an edge. */}
      <div className="absolute inset-0 bg-[radial-gradient(115%_95%_at_50%_45%,transparent_45%,oklch(0.12_0.03_262/0.55))]" />
      {overlay}
    </div>
  );
}
