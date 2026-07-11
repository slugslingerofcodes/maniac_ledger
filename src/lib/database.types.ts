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
          franchise_id: string | null;
          title: string;
          title_english: string | null;
          synopsis: string | null;
          poster_url: string | null;
          score: number | null;
          studio: string | null;
          total_episodes: number | null;
          status: Database["public"]["Enums"]["airing_status"];
          airing_start: string | null;
          airing_end: string | null;
          rating: Database["public"]["Enums"]["content_rating"] | null;
          season: Database["public"]["Enums"]["anime_season"] | null;
          year: number | null;
          type: Database["public"]["Enums"]["anime_type"];
          genres: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mal_id?: number | null;
          franchise_id?: string | null;
          title: string;
          title_english?: string | null;
          synopsis?: string | null;
          poster_url?: string | null;
          score?: number | null;
          studio?: string | null;
          total_episodes?: number | null;
          status?: Database["public"]["Enums"]["airing_status"];
          airing_start?: string | null;
          airing_end?: string | null;
          rating?: Database["public"]["Enums"]["content_rating"] | null;
          season?: Database["public"]["Enums"]["anime_season"] | null;
          year?: number | null;
          type?: Database["public"]["Enums"]["anime_type"];
          genres?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mal_id?: number | null;
          franchise_id?: string | null;
          title?: string;
          title_english?: string | null;
          synopsis?: string | null;
          poster_url?: string | null;
          score?: number | null;
          studio?: string | null;
          total_episodes?: number | null;
          status?: Database["public"]["Enums"]["airing_status"];
          airing_start?: string | null;
          airing_end?: string | null;
          rating?: Database["public"]["Enums"]["content_rating"] | null;
          season?: Database["public"]["Enums"]["anime_season"] | null;
          year?: number | null;
          type?: Database["public"]["Enums"]["anime_type"];
          genres?: string[];
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
          /** Times re-completed (0 = first watch). Migration 0017. */
          rewatch_count: number;
          started_at: string | null;
          completed_at: string | null;
          last_watched_at: string | null;
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
          rewatch_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
          last_watched_at?: string | null;
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
          rewatch_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
          last_watched_at?: string | null;
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
      episode_progress: {
        Row: {
          id: string;
          user_id: string;
          episode_id: string;
          /** Optional 1–5 star rating. Migration 0017. */
          rating: number | null;
          watched_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          episode_id: string;
          rating?: number | null;
          watched_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          episode_id?: string;
          rating?: number | null;
          watched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episode_progress_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "episodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "episode_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          mal_id: number;
          anime_title: string;
          poster_url: string | null;
          scheduled_date: string | null;
          notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          mal_id: number;
          anime_title: string;
          poster_url?: string | null;
          scheduled_date?: string | null;
          notified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          mal_id?: number;
          anime_title?: string;
          poster_url?: string | null;
          scheduled_date?: string | null;
          notified_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          mal_id: number;
          reason: string;
          title: string | null;
          poster_url: string | null;
          score: number | null;
          generated_at: string;
          dismissed: boolean;
        };
        Insert: {
          id?: string;
          user_id?: string;
          mal_id: number;
          reason: string;
          title?: string | null;
          poster_url?: string | null;
          score?: number | null;
          generated_at?: string;
          dismissed?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          mal_id?: number;
          reason?: string;
          title?: string | null;
          poster_url?: string | null;
          score?: number | null;
          generated_at?: string;
          dismissed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recommendations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          id: string;
          title: string;
          body: string;
          created_by: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          created_by?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          created_by?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      anime_chat_messages: {
        Row: {
          id: string;
          anime_id: string;
          user_id: string;
          username: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          anime_id: string;
          user_id?: string;
          username: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          anime_id?: string;
          user_id?: string;
          username?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anime_chat_messages_anime_id_fkey";
            columns: ["anime_id"];
            isOneToOne: false;
            referencedRelation: "anime";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "anime_chat_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          username: string;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          username: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          username?: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          follower_id: string;
          followee_id: string;
          created_at: string;
        };
        Insert: {
          follower_id?: string;
          followee_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          followee_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_followee_id_fkey";
            columns: ["followee_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      list_items: {
        Row: {
          id: string;
          list_id: string;
          anime_id: string;
          position: number;
          added_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          anime_id: string;
          position?: number;
          added_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          anime_id?: string;
          position?: number;
          added_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_anime_id_fkey";
            columns: ["anime_id"];
            isOneToOne: false;
            referencedRelation: "anime";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      anime_watched_count: {
        Row: {
          user_id: string | null;
          anime_id: string | null;
          watched_count: number | null;
        };
        Relationships: [];
      };
    };
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

export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
