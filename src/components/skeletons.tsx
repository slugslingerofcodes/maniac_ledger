import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared grey placeholder shapes.
 *
 * Every route-level `loading.tsx` and every client-side "still fetching" branch
 * composes from these, so a skeleton always matches the real layout's grid,
 * spacing and card proportions. A skeleton that doesn't match its content is
 * worse than none — the page visibly jumps when data lands.
 */

/** Page title + subtitle bars. Mirrors the `h1 + p` block every page opens with. */
export function PageHeaderSkeleton({
  className,
  withSubtitle = true,
}: {
  className?: string;
  withSubtitle?: boolean;
}) {
  return (
    <div className={className}>
      <Skeleton className="h-8 w-48" />
      {withSubtitle ? <Skeleton className="mt-2 h-4 w-72 max-w-full" /> : null}
    </div>
  );
}

/** A row of pill-shaped tab/filter chips. */
export function ChipRowSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-8 rounded-full"
          // Staggered widths read as text of differing lengths rather than a
          // suspiciously uniform bar chart.
          style={{ width: `${64 + ((i * 29) % 56)}px` }}
        />
      ))}
    </div>
  );
}

/**
 * The 2/3/5-column poster grid used by library, search, seasons, movies and the
 * manga browse pages. `withCaption` adds the title/meta lines under each poster.
 */
export function PosterGridSkeleton({
  count = 10,
  className,
  withCaption = true,
}: {
  count?: number;
  className?: string;
  withCaption?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          {withCaption ? (
            <>
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3 w-2/3" />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A horizontally scrolling poster rail (Continue Watching, Top Ten, …). */
export function PosterRailSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-4 overflow-hidden", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-32 shrink-0 sm:w-40">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-10/12" />
        </div>
      ))}
    </div>
  );
}

/** Stacked rows — schedule entries, feed items, friend requests, songs. */
export function ListRowsSkeleton({
  count = 6,
  className,
  withThumb = true,
}: {
  count?: number;
  className?: string;
  withThumb?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border p-3"
        >
          {withThumb ? (
            <Skeleton className="size-12 shrink-0 rounded-lg" />
          ) : null}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/3 min-w-32" />
            <Skeleton className="mt-2 h-3 w-1/2 min-w-40" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** A grid of equal-height cards — stats, store products, lists, announcements. */
export function CardGridSkeleton({
  count = 6,
  className,
  height = "h-32",
}: {
  count?: number;
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-xl", height)} />
      ))}
    </div>
  );
}

/** Paragraph placeholder — synopsis, news body, announcement text. */
export function TextBlockSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          // Last line short, like real ragged-right text.
          style={{ width: i === lines - 1 ? "55%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** The detail-page hero: poster beside a title/meta/synopsis column. */
export function DetailHeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 sm:flex-row", className)}>
      <Skeleton className="aspect-[2/3] w-full shrink-0 rounded-xl sm:w-56" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-9 w-3/4 max-w-md" />
        <Skeleton className="mt-3 h-4 w-40" />
        <ChipRowSkeleton className="mt-4" count={4} />
        <TextBlockSkeleton className="mt-6" lines={4} />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * Standard page shell: header bars, an optional chip row, then a body slot.
 * Keeps the `mx-auto max-w-6xl px-4 py-8` frame identical to the real pages.
 */
export function PageSkeleton({
  children,
  chips = 0,
  withSubtitle = true,
}: {
  children?: React.ReactNode;
  chips?: number;
  withSubtitle?: boolean;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton withSubtitle={withSubtitle} />
      {chips > 0 ? <ChipRowSkeleton className="mt-6" count={chips} /> : null}
      <div className="mt-6">{children}</div>
    </main>
  );
}
