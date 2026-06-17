import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { AnimeType, WatchStatus } from "@/types/anime";

export type AnimeCardItem = {
  id: string;
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
    <Card className="group gap-0 overflow-hidden py-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- poster hosts vary (MAL CDN, Supabase Storage); avoids next/image remote config.
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {item.score != null ? (
          <Badge className="absolute right-2 top-2 border-transparent bg-black/70 text-white backdrop-blur">
            ★ {item.score}
          </Badge>
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
  );
}
