import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const WIDTH = {
  poster: "w-32 sm:w-36 md:w-40 lg:w-44 xl:w-48",
  landscape: "w-64 sm:w-72 lg:w-80",
  schedule: "w-56 sm:w-64",
} as const;

/**
 * Shimmer stand-in for one browse row, built on the same gutter, padding and
 * card sizes as `BrowseRow`/`ExpandingCard`, so a row streaming in replaces its
 * skeleton without moving anything around it.
 */
export function RowSkeleton({
  variant = "poster",
  count = 8,
  eyebrow = false,
  ranked = false,
  className,
}: {
  variant?: keyof typeof WIDTH;
  count?: number;
  /** Reserve the eyebrow line some rows have above the title. */
  eyebrow?: boolean;
  /** Top 10 layout: a numeral gutter before each poster. */
  ranked?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden data-slot="row-skeleton" className={cn("pt-4", className)}>
      <div className="row-gutter">
        {eyebrow ? <Skeleton className="mb-1 h-4 w-28" /> : null}
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="row-gutter flex gap-3 overflow-hidden py-6 sm:gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "shrink-0",
              ranked && "w-40 pl-10 sm:w-48 sm:pl-14 md:w-52 lg:w-56 lg:pl-16 xl:w-60",
            )}
          >
            <div className={ranked ? "w-full" : WIDTH[variant]}>
              <Skeleton
                className={cn(
                  "w-full rounded-lg",
                  variant === "poster" && "aspect-[2/3]",
                  variant === "landscape" && "aspect-video",
                  variant === "schedule" && "h-20",
                )}
              />
              {variant === "poster" ? (
                <div className="mt-2 h-9">
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="mt-1.5 h-3 w-2/3" />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Banner stand-in: the featured banner's frame and height, in ink. */
export function BannerSkeleton() {
  return (
    <div aria-hidden className="banner-height relative overflow-hidden bg-banner">
      <div className="row-gutter flex h-full flex-col justify-end gap-3 pb-20 md:justify-center md:pb-12">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-12 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
        <Skeleton className="h-14 w-full max-w-lg" />
        <div className="flex gap-2.5">
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
