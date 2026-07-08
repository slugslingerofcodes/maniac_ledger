import type { CSSProperties } from "react";
import Image from "next/image";

import { getTopAnime } from "@/lib/jikan";
import { cn } from "@/lib/utils";

/**
 * Two counter-scrolling rows of trending posters for the landing hero.
 * Decorative: each row holds its list twice and the `marquee-track` keyframes
 * translate -50% for a seamless loop (paused under prefers-reduced-motion).
 * Fetches server-side, best-effort — renders nothing if Jikan is down.
 */
export async function TrendingPosterMarquee() {
  let posters: string[] = [];
  try {
    const { data } = await getTopAnime(24);
    posters = data
      .map((a) => a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url)
      .filter((url): url is string => Boolean(url));
  } catch {
    // best-effort backdrop; the hero works without it
  }
  if (posters.length < 8) return null;

  const rowA = posters.filter((_, i) => i % 2 === 0);
  const rowB = posters.filter((_, i) => i % 2 === 1);

  return (
    <div
      aria-hidden
      className="pointer-events-none flex flex-col gap-3 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
    >
      <MarqueeRow posters={rowA} duration="80s" />
      <MarqueeRow posters={rowB} duration="110s" reverse />
    </div>
  );
}

function MarqueeRow({
  posters,
  duration,
  reverse = false,
}: {
  posters: string[];
  duration: string;
  reverse?: boolean;
}) {
  // Doubled list: the keyframes end at -50%, which lands exactly on the copy.
  const loop = [...posters, ...posters];
  return (
    <div
      className={cn("marquee-track flex w-max gap-3", reverse && "marquee-reverse")}
      style={{ "--marquee-duration": duration } as CSSProperties}
    >
      {loop.map((src, i) => (
        <div
          key={i}
          className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg opacity-70 ring-1 ring-white/10 sm:w-24"
        >
          <Image src={src} alt="" fill sizes="96px" className="object-cover" />
        </div>
      ))}
    </div>
  );
}
