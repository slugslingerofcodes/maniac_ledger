"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { JikanAnime } from "@/lib/jikan";

/**
 * Netflix-style search backdrop: a wall of anime posters filling the viewport,
 * arranged in rows where **alternate rows scroll in opposite directions**
 * (odd rows reverse), over a dark cinematic base with colored glows and a
 * heavy legibility veil so the filters/results stay readable on top.
 *
 * Posters are fetched once from the public search API (popular Action titles);
 * until they arrive (or if the fetch fails) the dark base + glows still look
 * good. Reuses the global `marquee-track` keyframes, which pause under
 * prefers-reduced-motion.
 */
const ROWS = 8;

export function SearchPosterWall() {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/anime/search?genres=1", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        const urls = ((body.results ?? []) as JikanAnime[])
          .map((a) => a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url)
          .filter((u): u is string => Boolean(u));
        setPosters(urls);
      })
      .catch(() => {
        /* base backdrop stands on its own if this fails */
      });
    return () => controller.abort();
  }, []);

  // Split the posters into ROWS bands; each band repeats to fill wide screens.
  const rows: string[][] = Array.from({ length: ROWS }, (_, r) => {
    if (posters.length === 0) return [];
    const band: string[] = [];
    for (let i = 0; i < 12; i++) {
      band.push(posters[(r * 5 + i) % posters.length]!);
    }
    return band;
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Cinematic dark base. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0a0a12_0%,#07070d_55%,#040406_100%)]" />

      {/* Poster wall — vertically centered rows, counter-scrolling. */}
      {posters.length > 0 ? (
        <div className="absolute inset-0 flex -rotate-6 scale-125 flex-col justify-center gap-3 opacity-[0.28]">
          {rows.map((band, r) => (
            <PosterRow
              key={r}
              posters={band}
              reverse={r % 2 === 1}
              duration={`${70 + (r % 4) * 22}s`}
            />
          ))}
        </div>
      ) : null}

      {/* Colored cinematic glows for depth. */}
      <div
        className="aurora-blob aurora-blob-2 left-[10%] top-[10%] size-[42vmin]"
        style={{ backgroundColor: "rgba(124, 92, 255, 0.4)" }}
      />
      <div
        className="aurora-blob aurora-blob-3 bottom-[8%] right-[12%] size-[46vmin]"
        style={{ backgroundColor: "rgba(0, 200, 190, 0.34)" }}
      />

      {/* Legibility veils + vignette. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_40%,transparent_35%,rgba(0,0,0,0.72)_100%)]" />
      <div className="absolute inset-0 bg-background/62" />
    </div>
  );
}

function PosterRow({
  posters,
  reverse,
  duration,
}: {
  posters: string[];
  reverse: boolean;
  duration: string;
}) {
  const loop = [...posters, ...posters];
  return (
    <div
      className={cn(
        "marquee-track flex w-max gap-3",
        reverse && "marquee-reverse",
      )}
      style={{ "--marquee-duration": duration } as CSSProperties}
    >
      {loop.map((src, i) => (
        <div
          key={i}
          className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 sm:w-28"
        >
          {/* Plain <img>: many decorative posters straight from the CDN. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}
