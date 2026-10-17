import { PosterGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Two season groups of poster cards. Shared by the route's loading.tsx and the
 * page's own Suspense boundary, which shows it under the already-painted
 * header while the upcoming list streams in.
 */
export function UpcomingGroupsSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, group) => (
        <section key={group} className="mt-8">
          <Skeleton className="h-6 w-36" />
          <PosterGridSkeleton className="mt-4" count={10} />
        </section>
      ))}
    </>
  );
}
