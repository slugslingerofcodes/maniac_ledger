import { DetailHeroSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MAL-detail skeleton. This route resolves a MyAnimeList id through Jikan
 * before it can render anything, so it is the one most likely to sit on the
 * 350ms-spaced upstream queue — the shell should never be a blank screen.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-28" />
      <DetailHeroSkeleton className="mt-6" />

      <div className="my-8 h-px w-full bg-border" />

      <Skeleton className="h-5 w-32" />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
