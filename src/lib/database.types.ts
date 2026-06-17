/**
 * Supabase database types for the anime tracker.
 *
 * Hand-maintained to mirror `supabase/migrations/0001_anime.sql`. Shaped like
 * the output of `npx supabase gen types typescript` so it can be regenerated
 * later by overwriting this file.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      anime: {
        Row: {
          id: string;
          mal_id: number | null;
          title: string;
          synopsis: string | null;
          poster_url: string | null;
          total_episodes: number | null;
          status: Database["public"]["Enums"]["airing_status"];
          airing_start: string | null;
          airing_end: string | null;
          rating: Database["public"]["Enums"]["content_rating"] | null;
          season: Database["public"]["Enums"]["anime_season"] | null;
          year: number | null;
          type: Database["public"]["Enums"]["anime_type"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mal_id?: number | null;
          title: string;
          synopsis?: string | null;
          poster_url?: string | null;
          total_episodes?: number | null;
          status?: Database["public"]["Enums"]["airing_status"];
          airing_start?: string | null;
          airing_end?: string | null;
          rating?: Database["public"]["Enums"]["content_rating"] | null;
          season?: Database["public"]["Enums"]["anime_season"] | null;
          year?: number | null;
          type?: Database["public"]["Enums"]["anime_type"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mal_id?: number | null;
          title?: string;
          synopsis?: string | null;
          poster_url?: string | null;
          total_episodes?: number | null;
          status?: Database["public"]["Enums"]["airing_status"];
          airing_start?: string | null;
          airing_end?: string | null;
          rating?: Database["public"]["Enums"]["content_rating"] | null;
          season?: Database["public"]["Enums"]["anime_season"] | null;
          year?: number | null;
          type?: Database["public"]["Enums"]["anime_type"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      episodes: {
        Row: {
          id: string;
          anime_id: string;
          number: number;
          title: string | null;
          aired_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          anime_id: string;
          number: number;
          title?: string | null;
          aired_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          anime_id?: string;
          number?: number;
          title?: string | null;
          aired_date?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episodes_anime_id_fkey";
            columns: ["anime_id"];
            isOneToOne: false;
            referencedRelation: "anime";
            referencedColumns: ["id"];
          },
        ];
      };
      user_progress: {
        Row: {
          id: string;
          user_id: string;
          anime_id: string;
          episodes_watched: number;
          status: Database["public"]["Enums"]["watch_status"];
          score: number | null;
          notes: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          anime_id: string;
          episodes_watched?: number;
          status?: Database["public"]["Enums"]["watch_status"];
          score?: number | null;
          notes?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          anime_id?: string;
          episodes_watched?: number;
          status?: Database["public"]["Enums"]["watch_status"];
          score?: number | null;
          notes?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_progress_anime_id_fkey";
            columns: ["anime_id"];
            isOneToOne: false;
            referencedRelation: "anime";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      airing_status:
        | "not_yet_aired"
        | "currently_airing"
        | "finished_airing"
        | "hiatus"
        | "cancelled";
      content_rating: "g" | "pg" | "pg_13" | "r_17" | "r_plus" | "rx";
      anime_season: "winter" | "spring" | "summer" | "fall";
      anime_type: "tv" | "movie" | "ova" | "ona" | "special" | "music";
      watch_status:
        | "watching"
        | "completed"
        | "plan_to_watch"
        | "on_hold"
        | "dropped";
    };
    CompositeTypes: Record<never, never>;
  };
};

/* -------------------------------------------------------------------------- */
/* Convenience helpers (mirror the Supabase generated helpers)                */
/* -------------------------------------------------------------------------- */

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
