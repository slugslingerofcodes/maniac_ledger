import { Skeleton } from "@/components/ui/skeleton";

import { ScheduleBoardSkeleton } from "./schedule-skeleton";

/** Schedule skeleton: the two clocks, then a day column per weekday. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex justify-center gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="size-24 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      <ScheduleBoardSkeleton />
    </main>
  );
}
