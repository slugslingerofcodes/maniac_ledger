import Image from "next/image";

import { MorphLink } from "@/components/MorphLink";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { posterTransitionName } from "@/lib/view-transition";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { AnimeType, WatchStatus } from "@/types/anime";

export type LibraryCardItem = {
  id: string;
  /** MAL id when known — keys the poster morph (see posterTransitionName). */
  malId?: number | null;
  title: string;
  posterUrl: string | null;
  type: AnimeType | null;
  status: WatchStatus;
  episodesWatched: number;
  totalEpisodes: number | null;
  /** The user's personal rating (1–10), if set. */
  score: number | null;
};

export function LibraryCard({ item }: { item: LibraryCardItem }) {
  const status = WATCH_STATUS_META[item.status];
  const hasTotal = item.totalEpisodes != null && item.totalEpisodes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((item.episodesWatched / item.totalEpisodes!) * 100))
    : 0;

  return (
    <MorphLink
      href={`/anime/${item.id}`}
      name={posterTransitionName(item.malId, item.id)}
      className="group relative isolate block"
    >
    {/* Ambient glow: the poster itself, blurred, spilling past the card. */}
    {item.posterUrl ? (
      <div
        aria-hidden
        className="absolute inset-x-3 top-3 -z-10 aspect-[2/3] scale-105 opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
      >
        <Image src={item.posterUrl} alt="" fill sizes="200px" className="object-cover" />
      </div>
    ) : null}
    <Card className="gap-0 overflow-hidden py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40">
      <div data-morph className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        <Badge className={cn("absolute left-2 top-2 border", status.className)}>
          {status.label}
        </Badge>
        {/* Hover reveal: progress at a glance without leaving the grid. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/25 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="text-xs font-medium text-white">
            {hasTotal
              ? `${item.episodesWatched} / ${item.totalEpisodes} episodes`
              : `${item.episodesWatched} ep watched`}
          </p>
          {hasTotal ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <CardContent className="flex flex-col gap-2.5 p-3">
        <h3
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={item.title}
        >
          {item.title}
        </h3>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {hasTotal
                ? `${item.episodesWatched} / ${item.totalEpisodes}`
                : `${item.episodesWatched} ep`}
            </span>
          </div>
          {hasTotal ? <Progress value={percent} className="h-1.5" /> : null}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.score != null ? (
              <ScoreRing score={item.score} size={28} />
            ) : (
              <span>Not rated</span>
            )}
          </div>
          {item.type ? (
            <Badge variant="outline" className="uppercase tracking-wide">
              {item.type}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
    </MorphLink>
  );
}
