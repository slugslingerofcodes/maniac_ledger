import type { ReactNode } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Full-bleed image backdrop with a slow ken-burns drift and a dark scrim so
 * foreground content stays readable over a busy image.
 *
 * - `fixed`: pin to the viewport (covers the page behind scrolling content) —
 *   use for an app-wide backdrop. Otherwise it's `absolute` and fills the
 *   nearest positioned ancestor (use for a single hero/auth screen).
 * - `overlay`: replace the default scrim (e.g. a stronger flat darken when the
 *   backdrop sits behind dense content).
 *
 * Uses next/image (`fill`), but note `images.unoptimized` is on (next.config.ts),
 * so the source is served as-is — pass an already right-sized WebP.
 */
export function ImageBackdrop({
  src,
  fixed = false,
  overlay,
  className,
}: {
  src: string;
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
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="ken-burns object-cover"
      />
      {overlay ?? (
        <>
          <div className="absolute inset-0 bg-background/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-background/70" />
        </>
      )}
    </div>
  );
}
