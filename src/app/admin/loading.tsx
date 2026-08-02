import { CardGridSkeleton, ListRowsSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

/** Admin dashboard skeleton: stat tiles above the user/activity tables. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton className="mt-6" count={6} height="h-24" />
      <ListRowsSkeleton className="mt-8" count={8} withThumb={false} />
    </main>
  );
}
