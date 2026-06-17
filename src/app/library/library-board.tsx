import Link from "next/link";

import { LibraryCard } from "@/components/library-card";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

const GRID_CLASS =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/**
 * Async Server Component: fetches the signed-in user's tracked anime
 * (user_progress joined with the anime catalog; RLS scopes rows to them) and
 * renders the card grid. Rendered inside a <Suspense> boundary.
 *
 * Pass `status` to filter by watch status; omit (or pass null) for all.
 */
export async function LibraryBoard({ status }: { status: WatchStatus | null }) {
  const supabase = await createClient();

  let query = supabase
    .from("user_progress")
    .select(
      "episodes_watched, status, score, anime:anime_id (id, title, poster_url, type, total_episodes)",
    )
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your library. Please try again.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {status
            ? `No anime with status "${WATCH_STATUS_META[status].label}" yet.`
            : "Your library is empty. Find something to watch."}
        </p>
        {!status ? (
          <Link href="/search" className={cn(buttonVariants())}>
            Search anime
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {data.map((row) => (
        <LibraryCard
          key={row.anime.id}
          item={{
            id: row.anime.id,
            title: row.anime.title,
            posterUrl: row.anime.poster_url,
            type: row.anime.type,
            status: row.status as WatchStatus,
            episodesWatched: row.episodes_watched,
            totalEpisodes: row.anime.total_episodes,
            score: row.score,
          }}
        />
      ))}
    </div>
  );
}

export function LibraryBoardSkeleton() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 10 }).map((_, i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="aspect-[2/3] w-full rounded-none" />
          <div className="flex flex-col gap-2.5 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-10 rounded-md" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
