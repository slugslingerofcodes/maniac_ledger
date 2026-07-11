import { Skeleton } from "@/components/ui/skeleton";

/** Friends skeleton — header, add box, and a couple of row stacks. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-2 h-4 w-72" />
      <Skeleton className="mt-6 h-9 w-full rounded-md" />
      <Skeleton className="mt-8 h-4 w-32" />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
