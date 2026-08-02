"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { SearchSource } from "@/app/api/anime/search/route";
import type { JikanAnime } from "@/lib/jikan";

/** Normalized shape every poster-grid page reads. */
export type AnimeFeed = {
  results: JikanAnime[];
  totalPages: number;
  source: SearchSource | string;
  degraded: boolean;
};

/** Ten minutes: these are catalog browses, not per-user state. */
const FEED_STALE_MS = 10 * 60_000;
const FEED_GC_MS = 24 * 60 * 60_000;

/** Upstream pages can repeat a title across stitched sub-pages. */
function dedupe(results: JikanAnime[]): JikanAnime[] {
  const seen = new Set<number>();
  return results.filter((a) => {
    if (seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
}

/**
 * Cached poster-grid feed over one of the search endpoints.
 *
 * Replaces the fetch-into-useState-in-an-effect pattern the browse pages used
 * to share. Three things change for the user:
 *
 *  - **Revisits are instant.** Results live in the TanStack cache under the
 *    exact filter set, so going Seasons → detail → back repaints from memory
 *    instead of re-running the Jikan/AniList chain.
 *  - **Paging doesn't blank the page.** `keepPreviousData` holds the current
 *    grid on screen while the next page loads, so only the first-ever load
 *    shows skeletons; later loads just dim.
 *  - **In-flight requests are aborted** for free — the query function is handed
 *    TanStack's `signal`, which it cancels when the key changes or the
 *    component unmounts.
 */
export function useAnimeFeed({
  endpoint,
  params,
  enabled = true,
}: {
  /** Absolute path, e.g. "/api/anime/search". */
  endpoint: string;
  /** Query params; `undefined`/empty values are dropped before keying. */
  params: Record<string, string | number | undefined | null>;
  enabled?: boolean;
}) {
  // Sorted so two equivalent filter sets built in a different order share one
  // cache entry rather than fetching twice.
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => [k, String(v)])
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString();

  const query = useQuery({
    queryKey: ["anime-feed", endpoint, search],
    queryFn: async ({ signal }): Promise<AnimeFeed> => {
      const res = await fetch(`${endpoint}?${search}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = await res.json();
      return {
        results: dedupe((body.results ?? []) as JikanAnime[]),
        totalPages: body.totalPages ?? 1,
        source: body.source ?? "mal",
        degraded: Boolean(body.degraded),
      };
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: FEED_STALE_MS,
    gcTime: FEED_GC_MS,
  });

  return {
    ...query,
    /** True only for the first load of a key with nothing to show yet. */
    showSkeleton: query.isPending,
    /** True while a *different* page/filter loads behind the current grid. */
    isRefreshing: query.isPlaceholderData && query.isFetching,
  };
}
