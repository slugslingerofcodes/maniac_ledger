import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the anime detail page. Mirrors page.tsx's exact
 * dimensions (poster aspect, hero overlap, the lg:grid-cols-[1fr_320px] split,
 * episode-row height) so there's no layout shift when the real content swaps in.
 * Shown automatically while the RSC awaits Jikan/ensureEpisodes. Nav and
 * backdrop come from the (app) layout, so this mirrors page.tsx's Shell.
 */
export default function Loading() {
  return (
    <div className="relative flex flex-1 flex-col">
      <main className="flex-1">
        {/* Hero */}
        <section className="relative isolate overflow-hidden bg-muted/30">
          <div className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-8 sm:px-6">
            <Skeleton className="h-4 w-28" /> {/* back link */}
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
              <Skeleton className="aspect-[2/3] w-40 shrink-0 rounded-xl sm:w-52 sm:-mb-12" />
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-5 w-12 rounded-md" />
                </div>
                <Skeleton className="h-9 w-72 max-w-full" /> {/* title */}
                <Skeleton className="h-4 w-44" /> {/* english title */}
                <Skeleton className="h-4 w-56" /> {/* score / studio / season */}
              </div>
            </div>
          </div>
        </section>

        {/* Synopsis + sidebar */}
        <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-8 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* Synopsis card */}
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <Skeleton className="mb-3 h-5 w-24" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>

            {/* Tracking sidebar */}
            <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-20 rounded-full" />
                ))}
              </div>
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>

          {/* Separator */}
          <div className="my-8 h-px w-full bg-border" />

          {/* Episode list */}
          <Skeleton className="mb-3 h-5 w-28" />
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <ul className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 bg-card px-4 py-2.5"
                >
                  <Skeleton className="size-4 shrink-0 rounded" />
                  <Skeleton className="h-4 w-6 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
