import Image from "next/image";

import { MorphLink } from "@/components/MorphLink";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { posterTransitionName } from "@/lib/view-transition";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { AnimeType, WatchStatus } from "@/types/anime";

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

export function AnimeCard({ item }: { item: AnimeCardItem }) {
  const status = WATCH_STATUS_META[item.status];

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
        {item.score != null ? (
          <span className="absolute right-2 top-2 grid place-items-center rounded-full bg-black/70 p-1 backdrop-blur">
            <ScoreRing score={item.score} size={26} />
          </span>
        ) : null}
      </div>

      <CardContent className="flex flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={item.title}>
          {item.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={cn("border", status.className)}>{status.label}</Badge>
          {item.type ? (
            <Badge variant="outline" className="uppercase tracking-wide">
              {item.type}
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.episodesWatched}
          {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ""} episodes
        </p>
      </CardContent>
    </Card>
    </MorphLink>
  );
}
