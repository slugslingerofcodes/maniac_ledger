import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { WatchStatus } from "@/types/anime";

import { LibraryBoard, LibraryBoardSkeleton } from "./library-board";
import { LibraryFilter, LibraryFilterSkeleton } from "./library-filter";

const VALID_STATUSES: WatchStatus[] = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];

// ─── Summary strip ────────────────────────────────────────────────────────────

async function LibrarySummary() {
  const supabase = await createClient();
  const { data } = await supabase.from("user_progress").select("status");
  if (!data || data.length === 0) return null;

  const counts = data.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const parts: string[] = [`${data.length} anime`];
  if (counts.watching) parts.push(`${counts.watching} watching`);
  if (counts.completed) parts.push(`${counts.completed} completed`);
  if (counts.plan_to_watch) parts.push(`${counts.plan_to_watch} planned`);
  if (counts.on_hold) parts.push(`${counts.on_hold} on hold`);
  if (counts.dropped) parts.push(`${counts.dropped} dropped`);

  return (
    <p className="mt-1 text-sm text-muted-foreground">{parts.join(" · ")}</p>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Server-side auth guard (defense in depth alongside the proxy gate):
  // redirects to /login when there is no signed-in user.
  await requireUser();

  const params = await searchParams;
  const status: WatchStatus | null = VALID_STATUSES.includes(
    params.status as WatchStatus,
  )
    ? (params.status as WatchStatus)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your Library
          </h1>
          <Suspense fallback={<div className="mt-1 h-5" />}>
            <LibrarySummary />
          </Suspense>
        </div>

        <div className="mb-6">
          <Suspense fallback={<LibraryFilterSkeleton />}>
            <LibraryFilter />
          </Suspense>
        </div>

        {/* key forces the Suspense to remount (and show the skeleton) when
            the status filter changes, preventing stale card flash. */}
        <Suspense key={status ?? "all"} fallback={<LibraryBoardSkeleton />}>
          <LibraryBoard status={status} />
        </Suspense>
      </main>
    </div>
  );
}
