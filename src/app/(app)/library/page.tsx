import { Suspense } from "react";

import { LibraryCard } from "@/components/library-card";
import { OfflineBanner } from "@/components/OfflineBanner";
import { TrendingPostersBackdrop } from "@/components/TrendingPostersBackdrop";
import { getTopAnime } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

import { LibraryGridClient } from "./library-grid-client";
import { LibraryTabs } from "./library-tabs";

/** Trending poster URLs for the backdrop; best-effort (empty on Jikan failure). */
async function getTrendingPosters(): Promise<string[]> {
  try {
    const { data } = await getTopAnime(24);
    return data
      .map((a) => a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url)
      .filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

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
  const posters = await getTrendingPosters();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <TrendingPostersBackdrop posters={posters} />
      <OfflineBanner />
      <h1 className="text-gradient text-2xl font-semibold tracking-tight">Your Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything you&apos;re tracking, most recently updated first.
      </p>

      <Suspense fallback={null}>
        <ContinueWatching />
      </Suspense>

      <div className="mt-6">
        <LibraryTabs filters={FILTERS} current={filter} />
      </div>

      {/* Client-side, TanStack Query–backed grid: cached + persisted to
          IndexedDB so it survives offline. Filtering is client-side. */}
      <div className="mt-6">
        <LibraryGridClient filter={filter} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Continue Watching (server-rendered)                                        */
/* -------------------------------------------------------------------------- */

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
