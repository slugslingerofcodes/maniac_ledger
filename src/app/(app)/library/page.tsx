import Link from "next/link";
import { Suspense } from "react";

import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { LibraryCard } from "@/components/library-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

import { LibraryTabs } from "./library-tabs";

// Tabs shown at the top. "all" is a pseudo-status meaning "no filter".
const FILTERS = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "plan_to_watch", label: "Plan to Watch" },
  { value: "dropped", label: "Dropped" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

function isFilterValue(value: string | undefined): value is FilterValue {
  return value != null && FILTERS.some((f) => f.value === value);
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  const { status } = await searchParams;
  const filter: FilterValue = isFilterValue(status) ? status : "all";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything you&apos;re tracking, most recently updated first.
      </p>

      <Suspense fallback={null}>
        <ContinueWatching />
      </Suspense>

      <div className="mt-6">
        <LibraryTabs filters={FILTERS} current={filter} />
      </div>

      <div className="mt-6">
        {/* `key` forces the skeleton fallback to show again on each filter. */}
        <Suspense key={filter} fallback={<LibraryGridSkeleton />}>
          <LibraryGrid filter={filter} />
        </Suspense>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Data + grid (async — streamed behind <Suspense>)                           */
/* -------------------------------------------------------------------------- */

async function LibraryGrid({ filter }: { filter: FilterValue }) {
  const supabase = await createClient();

  // RLS scopes user_progress to the signed-in user, so no explicit user filter
  // is needed. Join the catalog row for poster/title/episode counts.
  let query = supabase
    .from("user_progress")
    .select(
      "episodes_watched, status, score, anime:anime_id (id, title, poster_url, type, total_episodes)",
    )
    .order("updated_at", { ascending: false });

  if (filter !== "all") {
    query = query.eq("status", filter satisfies WatchStatus);
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
    return <EmptyState filter={filter} />;
  }

  const counts = await getWatchedCounts();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((row) => (
        <LibraryCard
          key={row.anime.id}
          item={{
            id: row.anime.id,
            title: row.anime.title,
            posterUrl: row.anime.poster_url,
            type: row.anime.type,
            status: row.status,
            episodesWatched: counts.get(row.anime.id) ?? row.episodes_watched,
            totalEpisodes: row.anime.total_episodes,
            score: row.score,
          }}
        />
      ))}
    </div>
  );
}

/**
 * "Continue Watching" — anime with a `last_watched_at` (set by the
 * episode_progress trigger), newest first. Hidden when empty.
 */
async function ContinueWatching() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("user_progress")
    .select(
      "episodes_watched, status, score, last_watched_at, anime:anime_id (id, title, poster_url, type, total_episodes)",
    )
    .not("last_watched_at", "is", null)
    .order("last_watched_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return null;

  const counts = await getWatchedCounts();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">Continue Watching</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {data.map((row) => (
          <LibraryCard
            key={row.anime.id}
            item={{
              id: row.anime.id,
              title: row.anime.title,
              posterUrl: row.anime.poster_url,
              type: row.anime.type,
              status: row.status,
              episodesWatched: counts.get(row.anime.id) ?? row.episodes_watched,
              totalEpisodes: row.anime.total_episodes,
              score: row.score,
            }}
          />
        ))}
      </div>
    </section>
  );
}

/** Map of anime_id -> watched episode count, from the anime_watched_count view. */
async function getWatchedCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("anime_watched_count")
    .select("anime_id, watched_count");

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.anime_id) map.set(row.anime_id, row.watched_count ?? 0);
  }
  return map;
}

function LibraryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterValue }) {
  const isAll = filter === "all";

  return (
    <Card className="border border-dashed border-border bg-transparent">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {isAll
            ? "Your library is empty — start by searching for an anime."
            : "Nothing here with this status yet — add or update some anime."}
        </p>
        <Link href="/search" className={cn(buttonVariants())}>
          Search anime
        </Link>
      </CardContent>
    </Card>
  );
}
