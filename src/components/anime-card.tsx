import Image from "next/image";

import { MorphLink } from "@/components/MorphLink";
import { PosterFallback } from "@/components/poster-fallback";
import { ScoreRing } from "@/components/ScoreRing";
import { Tilt3D } from "@/components/Tilt3D";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { posterTransitionName } from "@/lib/view-transition";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { AnimeType, WatchStatus } from "@/types/anime";
import { posterUrl } from "@/lib/poster";

export type AnimeCardItem = {
  id: string;
  /** MAL id when known — keys the poster morph (see posterTransitionName). */
  malId?: number | null;
  title: string;
  posterUrl: string | null;
  type: AnimeType | null;
  status: WatchStatus;
  episodesWatched: number;
  totalEpisodes: number | null;
  /** The user's personal score (1–10), if rated. */
  score: number | null;
};

/**
 * A grid cell for one tracked anime.
 *
 * The poster is the whole card: title and metadata sit *on* the artwork under a
 * scrim rather than in a block beneath it, which is what the old layout did.
 * That block cost roughly a third of every cell's height to say what the poster
 * already says, and the badge row cost another line — so a grid of these now
 * fits noticeably more titles at the same poster size.
 *
 * Status moved from a pill to a colored edge down the left for the same reason:
 * it's readable at a glance across a whole grid, and it costs no layout at all.
 */
export function AnimeCard({ item }: { item: AnimeCardItem }) {
  const status = WATCH_STATUS_META[item.status];
  const hasTotal = item.totalEpisodes != null && item.totalEpisodes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((item.episodesWatched / item.totalEpisodes!) * 100))
    : 0;

  return (
    <MorphLink
      href={`/anime/${item.id}`}
      name={posterTransitionName(item.malId, item.id)}
      className="group relative isolate block rounded-xl focus-visible:outline-none"
    >
      {/* Ambient glow: the poster itself, blurred, spilling past the card. */}
      {item.posterUrl ? (
        <div
          aria-hidden
          className="absolute inset-x-3 top-3 -z-10 aspect-[2/3] scale-105 opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
        >
          <Image
            src={posterUrl(item.posterUrl, "blur")!}
            alt=""
            fill
            sizes="200px"
            className="object-cover"
          />
        </div>
      ) : null}
      <Tilt3D>
        <Card
          className={cn(
            status.tokenClassName,
            "relative gap-0 overflow-hidden rounded-xl py-0 transition-all duration-300",
            "hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40",
            "group-focus-visible:ring-2 group-focus-visible:ring-ring",
          )}
        >
          <div
            data-morph
            className="relative aspect-[2/3] w-full overflow-hidden bg-muted"
          >
            {/* Raw URL, not a pre-shrunk one: the loader picks the rendition
                per srcSet candidate, so this is crisp at 2× as well. */}
            {item.posterUrl ? (
              <Image
                src={item.posterUrl}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <PosterFallback title={item.title} />
            )}

            {/* Status as an edge rather than a pill — see the note above. */}
            <span
              aria-hidden
              className="status-edge absolute inset-y-0 left-0 z-10 w-[3px]"
            />

            {item.score != null ? (
              <span className="absolute right-2 top-2 z-10 grid place-items-center rounded-full bg-black/70 p-1 backdrop-blur">
                <ScoreRing score={item.score} size={26} />
              </span>
            ) : null}

            {/* Scrim: dense enough at the base to carry white type over any
                poster, and clear by the midpoint so the artwork still reads. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/92 via-black/55 to-transparent"
            />

            <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 p-2.5 pt-6">
              <h3
                className="line-clamp-2 text-sm font-medium leading-snug text-white drop-shadow-sm"
                title={item.title}
              >
                {item.title}
              </h3>
              {/* The edge that carries status is decorative, so the label has
                  to reach assistive tech some other way. */}
              <span className="sr-only">{status.label}</span>
              <p className="flex items-center gap-1.5 text-[11px] leading-none text-white/75">
                {item.type ? (
                  <>
                    <span className="uppercase tracking-wide">{item.type}</span>
                    <span aria-hidden className="text-white/40">
                      ·
                    </span>
                  </>
                ) : null}
                <span>
                  {item.episodesWatched}
                  {hasTotal ? ` / ${item.totalEpisodes}` : ""} ep
                </span>
              </p>
              {hasTotal ? (
                <div
                  aria-hidden
                  className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/25"
                >
                  <div
                    className="h-full rounded-full bg-[var(--status-accent)]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </Tilt3D>
    </MorphLink>
  );
}
