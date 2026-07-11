import { Skeleton } from "@/components/ui/skeleton";

/** Feed skeleton — title block + a stack of activity rows. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
