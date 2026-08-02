import { PageHeaderSkeleton, ListRowsSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Songs skeleton: header, search field, then opening/ending rows. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <Skeleton className="mt-6 h-10 w-full max-w-md rounded-lg" />
      <ListRowsSkeleton className="mt-6" count={6} />
    </main>
  );
}
