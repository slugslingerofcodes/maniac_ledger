/**
 * Domain types for the manga framework — thin aliases over the generated
 * Supabase `Database` type, mirroring `@/types/anime`.
 */

import type { Tables, TablesInsert, TablesUpdate, Enums } from "@/lib/database.types";

export type Manga = Tables<"manga">;
export type MangaInsert = TablesInsert<"manga">;
export type MangaUpdate = TablesUpdate<"manga">;

export type MangaProgress = Tables<"manga_progress">;
export type MangaProgressInsert = TablesInsert<"manga_progress">;
export type MangaProgressUpdate = TablesUpdate<"manga_progress">;

/** Per-user reading status for a manga. */
export type ReadingStatus = Enums<"reading_status">;

/** A manga_progress row joined to its parent manga. */
export type MangaLibraryEntry = MangaProgress & { manga: Manga };

/** Display label + badge colors per reading status (mirrors WATCH_STATUS_META). */
export const READING_STATUS_META: Record<
  ReadingStatus,
  { label: string; className: string }
> = {
  reading: {
    label: "Reading",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  },
  completed: {
    label: "Completed",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  },
  plan_to_read: {
    label: "Plan to Read",
    className: "bg-violet-500/15 text-violet-300 border-violet-500/20",
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

/** Reading statuses in display order (for tabs / selects). */
export const READING_STATUSES: ReadingStatus[] = [
  "reading",
  "completed",
  "plan_to_read",
  "on_hold",
  "dropped",
];
