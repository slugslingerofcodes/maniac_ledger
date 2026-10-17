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
 * Uses next/image (`fill`). The app's custom loader (next.config.ts) only
 * rewrites known poster CDNs, so a local file like this is served exactly as
 * given — pass an already right-sized WebP.
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
      {/* `unoptimized` because these are local files with exactly one
          rendition: the custom loader can only rewrite known poster CDNs, so
          it hands every requested width the same URL, and Next warns about a
          loader that ignores width. Saying so here is both accurate and how
          the warning is meant to be answered. */}
      <Image
        src={src}
        alt=""
        fill
        priority
        unoptimized
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
