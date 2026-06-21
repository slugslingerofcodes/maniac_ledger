"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ToggleEpisodeResult =
  | { ok: true; watched: boolean }
  | { ok: false; error: string };

/**
 * Marks a single episode watched (insert) or unwatched (delete) for the
 * signed-in user, using the cookies-based server Supabase client.
 *
 * RLS scopes `episode_progress` to `auth.uid()`, so no manual user filter is
 * needed on the read side; `user_id` is set explicitly on insert to satisfy the
 * onConflict target. `user_progress.last_watched_at` and the per-anime
 * `watched_count` are maintained by the DB trigger + the `anime_watched_count`
 * view — we deliberately don't write them here.
 */
export async function toggleEpisode(
  episodeId: string,
  watched: boolean,
): Promise<ToggleEpisodeResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to track episodes." };
  }

  if (watched) {
    const { error } = await supabase
      .from("episode_progress")
      .upsert(
        { user_id: user.id, episode_id: episodeId },
        { onConflict: "user_id,episode_id", ignoreDuplicates: true },
      );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("episode_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("episode_id", episodeId);
    if (error) return { ok: false, error: error.message };
  }

  // The signature doesn't carry animeId, so resolve it from the episode row to
  // target revalidation for the detail page.
  const { data: ep } = await supabase
    .from("episodes")
    .select("anime_id")
    .eq("id", episodeId)
    .maybeSingle();

  if (ep?.anime_id) revalidatePath(`/anime/${ep.anime_id}`);
  revalidatePath("/library");

  return { ok: true, watched };
}
