"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getUserLibrary } from "@/app/actions/library";
import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { LibraryCard } from "@/components/library-card";
import { PullToRefresh } from "@/components/PullToRefresh";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

export const LIBRARY_QUERY_KEY = ["user-library"] as const;

const FIVE_MIN_MS = 5 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * Client-side library grid backed by TanStack Query. The full library is cached
 * under one key (staleTime 5m, gcTime 24h) and persisted to IndexedDB, so it
 * renders from cache while offline. Status filtering is done client-side off the
 * cached list, so switching tabs never refetches.
 */
export function LibraryGridClient({ filter }: { filter: "all" | WatchStatus }) {
  const queryClient = useQueryClient();
  const [genre, setGenre] = useState<string | null>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => getUserLibrary(),
    staleTime: FIVE_MIN_MS,
    gcTime: ONE_DAY_MS,
  });

  // Every genre present in this library, for the filter chips. Hidden entirely
  // until entries carry genres (pre-0014 rows backfill as they're viewed).
  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of data ?? []) for (const g of item.genres) set.add(g);
    return [...set].sort();
  }, [data]);

  // Pull-to-refresh (mobile) invalidates the library query → refetch.
  const onRefresh = () =>
    queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });

  let content;
  if (isPending) {
    content = <GridSkeleton />;
  } else if (isError && !data) {
    // Errored (e.g. offline) AND no persisted cache to fall back on.
    content = (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your library. Please try again.
      </p>
    );
  } else {
    const items = (data ?? []).filter(
      (i) =>
        (filter === "all" || i.status === filter) &&
        (genre === null || i.genres.includes(genre)),
    );
    content = (
      <>
        {genreOptions.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            <GenreChip
              label="All genres"
              active={genre === null}
              onClick={() => setGenre(null)}
            />
            {genreOptions.map((g) => (
              <GenreChip
                key={g}
                label={g}
                active={genre === g}
                onClick={() => setGenre(genre === g ? null : g)}
              />
            ))}
          </div>
        ) : null}
        {items.length === 0 ? (
          genre !== null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing in your library matches “{genre}” with this status.
            </p>
          ) : (
            <EmptyState isAll={filter === "all"} />
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <LibraryCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </>
    );
  }

  return <PullToRefresh onRefresh={onRefresh}>{content}</PullToRefresh>;
}

function GenreChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-indigo-500 text-white"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState({ isAll }: { isAll: boolean }) {
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
