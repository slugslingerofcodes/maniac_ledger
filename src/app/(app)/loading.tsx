import { BannerSkeleton, RowSkeleton } from "@/components/browse/RowSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home skeleton, shown the instant the route is requested (while the auth
 * check runs). It is the page's own shell — banner, genre strip, then rows of
 * the exact sizes the real rows use — so when the page takes over, each
 * skeleton is replaced in place rather than the layout jumping.
 */
export default function Loading() {
  return (
    <div className="browse-scope relative flex flex-1 flex-col">
      <BannerSkeleton />
      {/* Genre strip */}
      <div aria-hidden className="row-gutter flex gap-2 overflow-hidden border-b border-border/60 py-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[34px] w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <main className="flex w-full flex-1 flex-col pb-12">
        <RowSkeleton variant="landscape" count={5} className="pt-6" />
        <RowSkeleton eyebrow ranked count={6} />
        <RowSkeleton eyebrow />
        <RowSkeleton />
      </main>
    </div>
  );
}
