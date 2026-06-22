"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getUserLibrary } from "@/app/actions/library";
import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { LibraryCard } from "@/components/library-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

const FIVE_MIN_MS = 5 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * Client-side library grid backed by TanStack Query. The full library is cached
 * under one key (staleTime 5m, gcTime 24h) and persisted to IndexedDB, so it
 * renders from cache while offline. Status filtering is done client-side off the
 * cached list, so switching tabs never refetches.
 */
export function LibraryGridClient({ filter }: { filter: "all" | WatchStatus }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["user-library"],
    queryFn: () => getUserLibrary(),
    staleTime: FIVE_MIN_MS,
    gcTime: ONE_DAY_MS,
  });

  // Pending with nothing cached yet → skeleton.
  if (isPending) return <GridSkeleton />;

  // Errored (e.g. offline) AND no persisted cache to fall back on.
  if (isError && !data) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your library. Please try again.
      </p>
    );
  }

  const items = (data ?? []).filter(
    (i) => filter === "all" || i.status === filter,
  );

  if (items.length === 0) return <EmptyState isAll={filter === "all"} />;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <LibraryCard key={item.id} item={item} />
      ))}
    </div>
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
