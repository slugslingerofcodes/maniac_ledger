import type { WatchStatus } from "@/types/anime";

/**
 * Display label + badge color classes for each watch status. Shared by
 * AnimeCard and LibraryCard so status styling stays consistent.
 */
export const WATCH_STATUS_META: Record<
  WatchStatus,
  { label: string; className: string }
> = {
  watching: {
    label: "Watching",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  },
  completed: {
    label: "Completed",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  },
  plan_to_watch: {
    label: "Plan to Watch",
    className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/25",
  },
  on_hold: {
    label: "On Hold",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  },
  dropped: {
    label: "Dropped",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/20",
  },
};
