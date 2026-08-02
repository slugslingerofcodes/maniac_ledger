import { PageHeaderSkeleton, TextBlockSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Recommendations skeleton: header, generate button, then poster + reason rows. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <Skeleton className="aspect-[2/3] w-24 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-2/3 max-w-sm" />
              <Skeleton className="mt-2 h-3 w-24" />
              <TextBlockSkeleton className="mt-4" lines={2} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
