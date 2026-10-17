import { Skeleton } from "@/components/ui/skeleton";

/**
 * The schedule board's placeholder: a day column per weekday. Shared by the
 * route's loading.tsx and the page's own Suspense boundary, which shows it
 * while the airing schedule streams in under the already-painted clocks.
 */
export function ScheduleBoardSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 7 }).map((_, day) => (
        <div key={day} className="rounded-xl border border-border p-3">
          <Skeleton className="h-4 w-20" />
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="h-14 w-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
