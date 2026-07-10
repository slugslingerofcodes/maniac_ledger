"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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

/**
 * Marks the given episode **and every earlier episode of the same anime**
 * watched in one go — so checking episode 7 fills in 1–6 as well (you can't
 * have watched a later episode without the earlier ones). Idempotent: episodes
 * already marked are left alone via `ignoreDuplicates`.
 */
export async function markEpisodesUpTo(
  episodeId: string,
): Promise<ToggleEpisodeResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to track episodes." };
  }

  // Resolve the target's anime + episode number.
  const { data: target } = await supabase
    .from("episodes")
    .select("anime_id, number")
    .eq("id", episodeId)
    .maybeSingle();
  if (!target?.anime_id) {
    return { ok: false, error: "Episode not found." };
  }

  // Every episode of this anime up to and including the target.
  const { data: earlier, error: listErr } = await supabase
    .from("episodes")
    .select("id")
    .eq("anime_id", target.anime_id)
    .lte("number", target.number);
  if (listErr) return { ok: false, error: listErr.message };

  const rows = (earlier ?? []).map((e) => ({
    user_id: user.id,
    episode_id: e.id,
  }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from("episode_progress")
      .upsert(rows, {
        onConflict: "user_id,episode_id",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/anime/${target.anime_id}`);
  revalidatePath("/library");

  return { ok: true, watched: true };
}

/**
 * Patch shape for a user_progress row. Every field is optional so callers can
 * send just what changed; upsert leaves unspecified columns untouched. `.strict()`
 * rejects unknown keys so a malformed client patch can't write arbitrary columns.
 */
const PROGRESS_PATCH = z
  .object({
    status: z
      .enum(["watching", "completed", "plan_to_watch", "on_hold", "dropped"])
      .optional(),
    score: z.number().int().min(1).max(10).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    episodes_watched: z.number().int().min(0).optional(),
  })
  .strict();

export type ProgressPatch = z.infer<typeof PROGRESS_PATCH>;

export type UpsertProgressResult = { ok: true } | { ok: false; error: string };

/**
 * Creates or patches the signed-in user's progress row for an anime. Upserts on
 * the (user_id, anime_id) unique constraint, so the first call adds the anime to
 * the library and later calls edit it. The Zod patch is validated server-side;
 * RLS scopes the write to the current user.
 */
export async function upsertProgress(
  animeId: string,
  patch: ProgressPatch,
): Promise<UpsertProgressResult> {
  const parsed = PROGRESS_PATCH.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: "Invalid progress update." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to track anime." };
  }

  const { error } = await supabase.from("user_progress").upsert(
    { user_id: user.id, anime_id: animeId, ...parsed.data },
    { onConflict: "user_id,anime_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/anime/${animeId}`);
  revalidatePath("/library");
  revalidatePath("/");

  return { ok: true };
}
