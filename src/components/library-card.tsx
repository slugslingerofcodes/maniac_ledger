import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { AnimeType, WatchStatus } from "@/types/anime";

export type LibraryCardItem = {
  id: string;
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
    <Link href={`/anime/${item.id}`} className="block">
    <Card className="group gap-0 overflow-hidden py-0 transition-shadow hover:ring-2 hover:ring-indigo-500/40">
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
        <Badge className={cn("absolute left-2 top-2 border", status.className)}>
          {status.label}
        </Badge>
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
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-amber-400">★</span>
            {item.score != null ? (
              <span className="font-medium text-foreground">{item.score}/10</span>
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
    </Link>
  );
}
