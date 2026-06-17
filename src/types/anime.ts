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

// Enums explicitly requested
export type WatchStatus = Enums<"watch_status">;
export type AnimeType = Enums<"anime_type">;

// Remaining schema enums, for completeness
export type AiringStatus = Enums<"airing_status">;
export type ContentRating = Enums<"content_rating">;
export type AnimeSeason = Enums<"anime_season">;
