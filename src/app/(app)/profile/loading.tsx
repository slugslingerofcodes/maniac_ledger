import { Skeleton } from "@/components/ui/skeleton";

/** Profile skeleton — title + the stack of settings cards. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-4 h-24 rounded-xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="mt-4 h-20 rounded-xl" />
      ))}
    </main>
  );
}
