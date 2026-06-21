"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { WatchStatus } from "@/types/anime";

export type UpdateProgressInput = {
  animeId: string;
  episodesWatched: number;
  status: WatchStatus;
  score: number | null;
};

export type UpdateProgressResult = { ok: true } | { ok: false; error: string };

const VALID_STATUSES: WatchStatus[] = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];

/**
 * Creates or updates the signed-in user's progress row for an anime.
 *
 * Uses upsert on the unique (user_id, anime_id) constraint, so this both adds
 * the anime to the user's library (first save) and edits it thereafter. RLS
 * ensures a user can only write their own row; user_id is set explicitly so the
 * onConflict target is satisfied.
 */
export async function updateProgress(
  input: UpdateProgressInput,
): Promise<UpdateProgressResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to track anime." };
  }

  // Validate against the DB CHECK constraints so we fail with a friendly
  // message instead of a raw Postgres error.
  if (!Number.isInteger(input.episodesWatched) || input.episodesWatched < 0) {
    return { ok: false, error: "Episodes watched must be 0 or more." };
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (input.score != null && (input.score < 1 || input.score > 10)) {
    return { ok: false, error: "Score must be between 1 and 10." };
  }

  const { error } = await supabase.from("user_progress").upsert(
    {
      user_id: user.id,
      anime_id: input.animeId,
      episodes_watched: input.episodesWatched,
      status: input.status,
      score: input.score,
    },
    { onConflict: "user_id,anime_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  // Refresh anywhere this row is shown.
  revalidatePath(`/anime/${input.animeId}`);
  revalidatePath("/library");
  revalidatePath("/");

  return { ok: true };
}

export type ToggleEpisodeResult =
  | { ok: true; watched: boolean }
  | { ok: false; error: string };

/**
 * Marks a single episode watched (insert) or unwatched (delete) for the
 * signed-in user. The episode_progress trigger bumps user_progress.last_watched_at
 * on insert, driving "Continue Watching".
 */
export async function toggleEpisodeWatched(
  episodeId: string,
  animeId: string,
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

  revalidatePath(`/anime/${animeId}`);
  revalidatePath("/library");

  return { ok: true, watched };
}
