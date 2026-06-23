import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Full-bleed image backdrop with a slow ken-burns drift and a dark scrim so
 * foreground content (a glass card) stays readable over a busy image. Render it
 * as the first child of a `relative overflow-hidden` container.
 *
 * Uses next/image (`fill`) so the source is optimized — resized + served as
 * AVIF/WebP — instead of shipping the raw file on every auth page load.
 */
export function ImageBackdrop({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
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
      {/* Scrim: flat darken + vignette gradient for legibility. */}
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-background/70" />
    </div>
  );
}
