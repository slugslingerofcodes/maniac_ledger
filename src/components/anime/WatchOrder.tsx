import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

/**
 * Franchise watch-order guide: every catalog entry sharing this franchise_id,
 * in release order (airing_start, falling back to year), numbered, with the
 * signed-in user's status/episode progress overlaid on each step. Release
 * order ≈ recommended watch order for the vast majority of franchises.
 *
 * Server component; RLS keeps the progress overlay scoped to the viewer.
 */
export async function WatchOrder({
  franchiseId,
  currentAnimeId,
}: {
  franchiseId: string;
  currentAnimeId: string;
}) {
  const supabase = await createClient();

  const { data: siblings } = await supabase
    .from("anime")
    .select(
      "id, title, title_english, poster_url, type, year, airing_start, total_episodes",
    )
    .eq("franchise_id", franchiseId);

  if (!siblings || siblings.length < 2) return null;

  const ordered = [...siblings].sort((a, b) => {
    const ta = a.airing_start
      ? Date.parse(a.airing_start)
      : a.year != null
        ? Date.UTC(a.year, 0)
        : Number.MAX_SAFE_INTEGER;
    const tb = b.airing_start
      ? Date.parse(b.airing_start)
      : b.year != null
        ? Date.UTC(b.year, 0)
        : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  // The viewer's progress across the franchise (RLS scopes to them).
  const { data: progressRows } = await supabase
    .from("user_progress")
    .select("anime_id, status, episodes_watched")
    .in(
      "anime_id",
      ordered.map((a) => a.id),
    );
  const progress = new Map(
    (progressRows ?? []).map((p) => [
      p.anime_id,
      { status: p.status as WatchStatus, episodes: p.episodes_watched },
    ]),
  );

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((entry, i) => {
        const p = progress.get(entry.id);
        const isCurrent = entry.id === currentAnimeId;
        return (
          <Link
            key={entry.id}
            href={`/anime/${entry.id}`}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40",
              isCurrent && "ring-2 ring-primary/50",
            )}
          >
            <span className="w-6 shrink-0 text-center font-didot text-lg text-muted-foreground">
              {i + 1}
            </span>
            <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-muted">
              {entry.poster_url ? (
                <Image
                  src={entry.poster_url}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:text-primary">
                {entry.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  entry.type?.toUpperCase(),
                  entry.year != null ? String(entry.year) : null,
                  entry.total_episodes != null
                    ? `${entry.total_episodes} ep`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {p ? (
              <Badge
                variant={p.status === "completed" ? "default" : "secondary"}
                className="shrink-0"
              >
                {p.status === "watching" && entry.total_episodes
                  ? `${p.episodes}/${entry.total_episodes}`
                  : WATCH_STATUS_META[p.status].label}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                Not tracked
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}
