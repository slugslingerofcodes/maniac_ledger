import { TextBlockSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The lead story and the column grid. Shared by the route's loading.tsx and
 * the page's own Suspense boundary, which shows it under the already-printed
 * masthead while the Reddit wire streams in.
 */
export function NewsBodySkeleton() {
  return (
    <>
      {/* Lead story */}
      <div className="mt-6 grid gap-5 border-b-2 border-foreground/50 pb-6 sm:grid-cols-[1fr_260px]">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-full" />
          <Skeleton className="mt-2 h-8 w-4/5" />
          <TextBlockSkeleton className="mt-4" lines={3} />
        </div>
        <Skeleton className="aspect-[4/3] w-full rounded-md" />
      </div>

      {/* Columns */}
      <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="mt-1.5 h-5 w-2/3" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
    </>
  );
}
