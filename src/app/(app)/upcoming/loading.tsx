import { PageHeaderSkeleton, PosterGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Upcoming skeleton: season-grouped poster grids. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      {Array.from({ length: 2 }).map((_, group) => (
        <section key={group} className="mt-8">
          <Skeleton className="h-6 w-36" />
          <PosterGridSkeleton className="mt-4" count={10} />
        </section>
      ))}
    </main>
  );
}
