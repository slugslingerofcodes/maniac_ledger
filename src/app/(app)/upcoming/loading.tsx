import { PageHeaderSkeleton } from "@/components/skeletons";

import { UpcomingGroupsSkeleton } from "./upcoming-skeleton";

/** Upcoming skeleton: season-grouped poster grids. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton />
      <UpcomingGroupsSkeleton />
    </main>
  );
}
