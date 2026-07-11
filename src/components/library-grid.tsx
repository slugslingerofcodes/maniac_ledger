import Link from "next/link";

import { AnimeCard } from "@/components/anime-card";
import { SlimeIllustration } from "@/components/SlimeIllustration";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

/** Home-page preview cap — the full library lives on /library. */
const PREVIEW_LIMIT = 10;

/**
 * Async Server Component: fetches the signed-in user's tracked anime (RLS scopes
 * rows to them) and renders the responsive card grid. Rendered inside a
 * <Suspense> boundary so the skeleton grid shows while this awaits.
 *
 * Shows at most PREVIEW_LIMIT entries; when there are more, a "View all"
 * card links to the full /library tab. Fetches one extra row so it knows
 * whether to show that link without a count query.
 */
export async function LibraryGrid() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_progress")
    .select(
      "episodes_watched, status, score, anime:anime_id (id, title, poster_url, type, total_episodes)",
    )
    .order("created_at", { ascending: false })
    .limit(PREVIEW_LIMIT + 1);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your library. Please try again.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="pattern-seigaiha flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <SlimeIllustration className="w-40" />
        <p className="text-sm text-muted-foreground">
          Your library is empty. Find something to watch.
        </p>
        <Link href="/search" className={cn(buttonVariants())}>
          Search anime
        </Link>
      </div>
    );
  }

  const hasMore = data.length > PREVIEW_LIMIT;
  const preview = data.slice(0, PREVIEW_LIMIT);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {preview.map((row) => (
        <AnimeCard
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
      {hasMore ? (
        <Link
          href="/library"
          className="group flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 text-center transition hover:border-primary/50 hover:bg-card"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-lg text-primary transition group-hover:bg-primary/25">
            →
          </span>
          <span className="px-3 text-sm font-medium text-muted-foreground transition group-hover:text-foreground">
            View your full library
          </span>
        </Link>
      ) : null}
    </div>
  );
}
