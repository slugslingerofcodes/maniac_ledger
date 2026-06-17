"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

const ALL_STATUSES = Object.keys(WATCH_STATUS_META) as WatchStatus[];

export function LibraryFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const current = searchParams.get("status") as WatchStatus | null;

  function select(next: WatchStatus | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("status", next);
    } else {
      params.delete("status");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
      <button
        onClick={() => select(null)}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          current == null
            ? "border-indigo-500/60 bg-indigo-500/20 text-indigo-300"
            : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
        )}
      >
        All
      </button>

      {ALL_STATUSES.map((status) => {
        const meta = WATCH_STATUS_META[status];
        const active = current === status;
        return (
          <button
            key={status}
            onClick={() => select(status)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? `border-current ${meta.className}`
                : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
            )}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function LibraryFilterSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {["All", "Watching", "Completed", "Plan to Watch", "On Hold", "Dropped"].map(
        (label) => (
          <div
            key={label}
            className="h-6 rounded-full border border-white/10 px-3 py-1 text-xs text-transparent"
          >
            {label}
          </div>
        ),
      )}
    </div>
  );
}
