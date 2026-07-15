import Image from "next/image";
import { Playfair_Display } from "next/font/google";

import { cn } from "@/lib/utils";

// Regal display serif for the "ANIME MANIACS" wordmark — matches the source
// banner (Playfair Display). Self-hosted by next/font.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--font-playfair",
  display: "swap",
});

/**
 * Compact header rendition of the ANIME MANIACS brand banner: a navy medallion
 * bar with a gold shimmering "ANIME · [AM monogram] · MANIACS" wordmark and a
 * thin gold frame. Sized natively for the sticky header (h-11) so it stays
 * crisp rather than a muddy downscale of the full 1600×600 artwork.
 */
export function SiteBanner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        playfair.variable,
        "brand-banner relative inline-flex h-11 items-center gap-1.5 overflow-hidden rounded-lg pl-2.5 pr-3",
        className,
      )}
    >
      <span className="brand-word text-[15px]">ANIME</span>
      <Image
        src="/am-monogram.png"
        alt=""
        width={80}
        height={80}
        priority
        className="brand-mono size-9 rounded-full ring-1 ring-amber-300/30"
      />
      <span className="brand-word text-[15px]">MANIACS</span>
    </span>
  );
}
