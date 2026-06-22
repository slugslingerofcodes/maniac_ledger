import { Skeleton } from "@/components/ui/skeleton";

/**
 * Search route skeleton. Matches page.tsx — the centered search input and the
 * 2/3/5-col poster grid — so the chunk-load flash doesn't shift layout. (Search
 * is a client component, so this shows briefly while its bundle loads.)
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mx-auto mb-10 max-w-xl">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
