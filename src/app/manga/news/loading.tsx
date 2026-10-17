import { Skeleton } from "@/components/ui/skeleton";

import { NewsBodySkeleton } from "./news-skeleton";

/** Manga Times skeleton: masthead, lead story, then the column grid. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      {/* Masthead */}
      <div className="border-y-2 border-foreground/50 py-4 text-center">
        <Skeleton className="mx-auto h-10 w-72 max-w-full" />
        <Skeleton className="mx-auto mt-2 h-3 w-56 max-w-full" />
      </div>

      <NewsBodySkeleton />
    </main>
  );
}
