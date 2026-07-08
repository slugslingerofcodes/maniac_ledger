import Image from "next/image";

import { getTopAnime } from "@/lib/jikan";

/**
 * Netflix-style hero backdrop: a dense, slightly tilted collage of trending
 * posters under a dark scrim that fades into the page background. Absolute —
 * mount inside a `relative isolate` section. Server-fetched, best-effort
 * (renders nothing if Jikan is down); `getTopAnime` is day-cached so this
 * shares its fetch with the marquee and the /library backdrop.
 */
export async function TrendingPosterWall() {
  let posters: string[] = [];
  try {
    const { data } = await getTopAnime(24);
    posters = data
      .map((a) => a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url)
      .filter((url): url is string => Boolean(url));
  } catch {
    // best-effort backdrop; the hero gradient below still works
  }
  if (posters.length < 8) return null;

  // Repeat so the tilted grid overshoots every viewport edge.
  const tiles = [...posters, ...posters].slice(0, 36);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -inset-x-[10%] -inset-y-[14%] grid rotate-[-4deg] grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
        {tiles.map((src, i) => (
          <div
            key={i}
            className="relative aspect-[2/3] overflow-hidden rounded-md ring-1 ring-white/5"
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 25vw, 12vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {/* Scrim: light flat darken + bottom fade — posters stay recognizable
          while the headline and CTAs keep contrast. */}
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/35 to-zinc-950/10" />
    </div>
  );
}
