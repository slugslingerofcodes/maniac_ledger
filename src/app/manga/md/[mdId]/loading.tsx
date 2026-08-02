import { DetailHeroSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Manga detail skeleton: cover + metadata hero, then the chapter list. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-28" />
      <DetailHeroSkeleton className="mt-6" />

      <div className="my-8 h-px w-full bg-border" />

      <Skeleton className="h-5 w-28" />
      <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <ul className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 bg-card px-4 py-2.5">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-8 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
