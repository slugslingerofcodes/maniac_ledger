import { PageHeaderSkeleton, PosterGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Miscellaneous skeleton — covers the client bundle's own load. Once mounted,
 * the page swaps to its in-component skeleton while results fetch.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      <PosterGridSkeleton className="mt-6" count={10} withCaption={false} />
    </main>
  );
}
