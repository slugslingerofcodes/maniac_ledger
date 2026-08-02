import {
  PosterGridSkeleton,
  PosterRailSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home skeleton. The home page fans out to a dozen Jikan/AniList calls behind
 * `force-dynamic`, so it is the slowest first paint in the app — this mirrors
 * the hero → rails → discovery grid stack so the shell appears immediately and
 * nothing shifts as each section streams in.
 */
export default function Loading() {
  return (
    <main className="flex-1">
      {/* Hero carousel */}
      <Skeleton className="h-[46vh] min-h-72 w-full rounded-none sm:h-[58vh]" />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* Genre ribbon */}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
        </div>

        {/* Continue watching rail */}
        <Skeleton className="mt-10 h-6 w-44" />
        <PosterRailSkeleton className="mt-4" count={6} />

        {/* Discovery tabs + grid */}
        <div className="mt-10 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-md" />
          ))}
        </div>
        <PosterGridSkeleton
          className="mt-4 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
          count={12}
        />

        {/* Sidebar lists (top airing / upcoming / movies) */}
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col}>
              <Skeleton className="h-5 w-32" />
              <div className="mt-3 flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-16 w-11 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
