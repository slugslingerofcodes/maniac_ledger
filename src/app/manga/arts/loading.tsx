import { PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Art/poster gallery skeleton. These pages lay images out in a masonry-ish
 * grid rather than fixed 2:3 cards, so the tiles vary in height to match.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <Skeleton className="mt-6 h-10 w-full max-w-md rounded-lg" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-lg"
            style={{ height: `${180 + ((i * 47) % 120)}px` }}
          />
        ))}
      </div>
    </main>
  );
}
