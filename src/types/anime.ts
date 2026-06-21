/**
 * Domain types for the anime tracker.
 *
 * These are thin aliases over the generated Supabase `Database` type
 * (`@/lib/database.types`), so they stay in sync with the schema automatically.
 */

import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  Views,
} from "@/lib/database.types";

// Table row shapes
export type Anime = Tables<"anime">;
export type AnimeInsert = TablesInsert<"anime">;
export type AnimeUpdate = TablesUpdate<"anime">;

export type Episode = Tables<"episodes">;
export type EpisodeInsert = TablesInsert<"episodes">;
export type EpisodeUpdate = TablesUpdate<"episodes">;

export type UserProgress = Tables<"user_progress">;
export type UserProgressInsert = TablesInsert<"user_progress">;
export type UserProgressUpdate = TablesUpdate<"user_progress">;

export type EpisodeProgress = Tables<"episode_progress">;
export type EpisodeProgressInsert = TablesInsert<"episode_progress">;
export type EpisodeProgressUpdate = TablesUpdate<"episode_progress">;

export type Notification = Tables<"notifications">;
export type NotificationInsert = TablesInsert<"notifications">;
export type NotificationUpdate = TablesUpdate<"notifications">;

/** Derived watched-episode count per (user, anime) — from the SQL view. */
export type AnimeWatchedCount = Views<"anime_watched_count">;

/**
 * A user's library row joined to its parent anime — the shape returned by
 * `user_progress` selects that embed the related `anime` row, e.g.
 * `.select("*, anime(*)")`.
 */
export type LibraryEntry = UserProgress & { anime: Anime };

// Enums explicitly requested
export type WatchStatus = Enums<"watch_status">;
/** Per-user watch status for an anime (alias of {@link WatchStatus}). */
export type UserStatus = Enums<"watch_status">;
export type AnimeType = Enums<"anime_type">;

// Remaining schema enums, for completeness
export type AiringStatus = Enums<"airing_status">;
export type ContentRating = Enums<"content_rating">;
export type AnimeSeason = Enums<"anime_season">;
