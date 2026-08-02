import { PageHeaderSkeleton, TextBlockSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Announcements skeleton: header, then stacked announcement cards. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <Skeleton className="h-4 w-1/2" />
            <TextBlockSkeleton className="mt-3" lines={2} />
            <Skeleton className="mt-3 h-3 w-32" />
          </article>
        ))}
      </div>
    </main>
  );
}
