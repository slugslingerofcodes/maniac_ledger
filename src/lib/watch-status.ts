import type { WatchStatus } from "@/types/anime";

/**
 * Display label + styling hooks for each watch status. Shared by AnimeCard and
 * LibraryCard so status styling stays consistent.
 *
 * Colors are not spelled out here any more. Each status maps to a class that
 * publishes a `--status-accent` custom property (see the "Watch status accents"
 * block in `globals.css`), and every treatment — the badge tint, the card's
 * colored edge — derives from that one value. Two consequences worth keeping:
 * a status is retinted in one place rather than five, and light/dark can each
 * carry a tone that survives its own background, which inline styles can't do.
 */
export const WATCH_STATUS_META: Record<
  WatchStatus,
  {
    label: string;
    /** Ready-made badge skin: the accent scope plus the tint that reads it. */
    className: string;
    /** Accent scope alone, for a container whose children read the accent. */
    tokenClassName: string;
  }
> = {
  watching: {
    label: "Watching",
    className: "status-watching status-tint",
    tokenClassName: "status-watching",
  },
  completed: {
    label: "Completed",
    className: "status-completed status-tint",
    tokenClassName: "status-completed",
  },
  plan_to_watch: {
    label: "Plan to Watch",
    className: "status-plan_to_watch status-tint",
    tokenClassName: "status-plan_to_watch",
  },
  on_hold: {
    label: "On Hold",
    className: "status-on_hold status-tint",
    tokenClassName: "status-on_hold",
  },
  dropped: {
    label: "Dropped",
    className: "status-dropped status-tint",
    tokenClassName: "status-dropped",
  },
};
