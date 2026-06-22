import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Library route skeleton. Mirrors page.tsx's layout — title block, tab row, and
 * the 2/3/5-col card grid — so there's no layout shift when content swaps in.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <AnimeCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
