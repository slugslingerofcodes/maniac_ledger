import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Compact header rendition of the ANIME MANIACS brand banner: a navy medallion
 * bar with a gold shimmering "ANIME · [AM monogram] · MANIACS" wordmark and a
 * thin gold frame. Sized natively for the sticky header (h-11) so it stays
 * crisp rather than a muddy downscale of the full 1600×600 artwork.
 *
 * Phones get a compact rendition. At full size the banner is 211px, which with
 * the menu button and the search/bell/avatar group made the header row 28px
 * wider than a 375px screen — and one overflowing row widens the whole layout
 * viewport, so every page scrolled sideways and the avatar sat off-screen.
 * Below 360px only the monogram remains.
 */
export function SiteBanner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "brand-banner relative inline-flex h-9 items-center gap-1 overflow-hidden rounded-lg pl-2 pr-2.5 max-[359px]:px-1 sm:h-11 sm:gap-1.5 sm:pl-2.5 sm:pr-3",
        className,
      )}
    >
      <span className="brand-word text-[12px] max-[359px]:hidden sm:text-[15px]">ANIME</span>
      <Image
        src="/am-monogram.webp"
        alt=""
        width={80}
        height={80}
        priority
        unoptimized
        className="brand-mono size-7 rounded-full ring-1 ring-amber-300/30 sm:size-9"
      />
      <span className="brand-word text-[12px] max-[359px]:hidden sm:text-[15px]">MANIACS</span>
    </span>
  );
}
