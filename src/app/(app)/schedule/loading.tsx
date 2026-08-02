import { Skeleton } from "@/components/ui/skeleton";

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
    </main>
  );
}
