"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the current route live: when the signed-in user's progress for this
 * anime changes elsewhere (another tab/device), re-fetches the Server Component
 * tree via `router.refresh()`. Cheap and always correct — the server re-queries
 * under RLS, so there's no client-side cache to reconcile.
 *
 * Filtering caveats (Realtime allows only one column-equality per subscription):
 *  - `user_progress` is filtered by `anime_id`; RLS narrows it to this user's row.
 *  - `episode_progress` has no `anime_id` column, so it's filtered by `user_id`.
 *    Toggling an episode of a *different* anime will also trigger a refresh here
 *    — acceptable, since refresh is idempotent and inexpensive.
 *
 * Requires the tables to be in the `supabase_realtime` publication with
 * `REPLICA IDENTITY FULL` (see migration 0006) or no events arrive.
 */
export function useRealtimeProgress(animeId: string, userId: string | null) {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`progress:${userId}:${animeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_progress",
          filter: `anime_id=eq.${animeId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "episode_progress",
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      // Unsubscribes and tears down the socket subscription for this channel.
      supabase.removeChannel(channel);
    };
  }, [animeId, userId, router]);
}
