import { PageHeaderSkeleton, PosterGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Manga browse skeleton: header, search field, filter chips, cover grid. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <Skeleton className="mt-6 h-10 w-full max-w-md rounded-lg" />
      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <PosterGridSkeleton className="mt-6" count={10} />
    </main>
  );
}
