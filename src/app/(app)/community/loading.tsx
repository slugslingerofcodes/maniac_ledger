import { PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Community skeleton: header, the four Anime Corner cards, then the three
 * in-app cards.
 *
 * Present for the same reason every other route here has one — without it a
 * dynamic route (this one calls `requireUser`) can only be partially
 * prefetched, so the tab shows nothing until the server responds. With it,
 * the shell is prefetched and the navigation is immediate.
 */
export default function Loading() {
  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />

      <Skeleton className="mt-10 h-6 w-40" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
          >
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-3 w-full max-w-xs" />
            </div>
          </div>
        ))}
      </div>

      <Skeleton className="mt-10 h-6 w-32" />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
          >
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
