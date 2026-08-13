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

export type AdvanceEpisodeResult =
  | {
      ok: true;
      /** The episode number just marked watched. */
      episode: number;
      episodesWatched: number;
      totalEpisodes: number | null;
      /** True when this advance finished the series (status → completed). */
      completed: boolean;
    }
  | { ok: false; error: string };

/**
 * Marks the *next* unwatched episode of an anime watched, from wherever the
 * user happens to be — the home rail, the library grid — without a trip to the
 * detail page. This is the app's core action, so it deliberately works whether
 * or not the `episodes` catalog has been backfilled for this title yet
 * (`ensureEpisodes` only runs when a detail page is opened):
 *
 *   - if the matching `episodes` row exists we insert `episode_progress`, which
 *     fires the `touch_last_watched_at` trigger and feeds `anime_watched_count`,
 *     keeping the per-episode checklist and this button in agreement;
 *   - either way `user_progress.episodes_watched` is set to the new number, so
 *     an un-backfilled title still advances instead of silently doing nothing.
 *
 * Reaching the finale flips the entry to `completed`; any other advance from a
 * non-watching status flips it to `watching` (bumping a `plan_to_watch` entry
 * means you started it).
 */
export async function advanceEpisode(
  animeId: string,
): Promise<AdvanceEpisodeResult> {
  if (!z.string().uuid().safeParse(animeId).success) {
    return { ok: false, error: "Invalid anime." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to track episodes." };
  }

  const { data: current, error: readErr } = await supabase
    .from("user_progress")
    .select("episodes_watched, status, anime:anime_id (total_episodes)")
    // Public profiles' progress is readable (migration 0015), so an unscoped
    // maybeSingle() can match several rows and error instead of answering.
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) {
    return { ok: false, error: "That anime isn't in your library yet." };
  }

  const total = current.anime?.total_episodes ?? null;
  const next = current.episodes_watched + 1;
  if (total != null && total > 0 && next > total) {
    return { ok: false, error: "You've already finished this one." };
  }

  const completed = total != null && total > 0 && next === total;

  // Best-effort per-episode row: absent until the detail page backfills the
  // catalog, and a failure here must not block the counter below.
  const { data: episode } = await supabase
    .from("episodes")
    .select("id")
    .eq("anime_id", animeId)
    .eq("number", next)
    .maybeSingle();
  if (episode?.id) {
    await supabase
      .from("episode_progress")
      .upsert(
        { user_id: user.id, episode_id: episode.id },
        { onConflict: "user_id,episode_id", ignoreDuplicates: true },
      );
  }

  const { error } = await supabase
    .from("user_progress")
    .update({
      episodes_watched: next,
      status: completed ? "completed" : "watching",
      // The trigger sets this from episode_progress, but only when the catalog
      // row existed — write it here too so "Continue Watching" reorders either
      // way.
      last_watched_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("anime_id", animeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/anime/${animeId}`);
  revalidatePath("/library");
  revalidatePath("/");

  return {
    ok: true,
    episode: next,
    episodesWatched: next,
    totalEpisodes: total,
    completed,
  };
}

/**
 * The exact inverse of {@link advanceEpisode} — un-watches the highest watched
 * episode and drops the counter by one. Exists so the "+1" button can offer a
 * real undo: reverting the counter alone would leave an orphaned
 * `episode_progress` row and the detail-page checklist disagreeing with the
 * card. `status` is restored by the caller, which knows what it was.
 */
export async function rewindEpisode(
  animeId: string,
  restoreStatus?: ProgressPatch["status"],
): Promise<UpsertProgressResult> {
  if (!z.string().uuid().safeParse(animeId).success) {
    return { ok: false, error: "Invalid anime." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: current } = await supabase
    .from("user_progress")
    .select("episodes_watched")
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Entry not found." };

  const previous = Math.max(0, current.episodes_watched - 1);

  const { data: episode } = await supabase
    .from("episodes")
    .select("id")
    .eq("anime_id", animeId)
    .eq("number", current.episodes_watched)
    .maybeSingle();
  if (episode?.id) {
    await supabase
      .from("episode_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("episode_id", episode.id);
  }

  const { error } = await supabase
    .from("user_progress")
    .update({
      episodes_watched: previous,
      ...(restoreStatus ? { status: restoreStatus } : {}),
    })
    .eq("user_id", user.id)
    .eq("anime_id", animeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/anime/${animeId}`);
  revalidatePath("/library");
  revalidatePath("/");
  return { ok: true };
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
/**
 * The viewer's rewatch count for an anime, or null when the entry doesn't
 * exist or migration 0017 (rewatch_count) hasn't been applied — callers hide
 * the rewatch UI in that case instead of erroring.
 */
export async function getRewatchCount(
  animeId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_progress")
    .select("rewatch_count")
    // Public profiles' progress is readable (migration 0015), so an unscoped
    // maybeSingle() can match several rows and error instead of answering.
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();
  if (error || !data) return null;
  return data.rewatch_count ?? 0;
}

/** +1 rewatch on a completed entry (also re-marks it completed). */
export async function incrementRewatch(
  animeId: string,
): Promise<UpsertProgressResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: current, error: readErr } = await supabase
    .from("user_progress")
    .select("rewatch_count")
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();
  if (readErr || !current) {
    return { ok: false, error: "Rewatch tracking isn't available yet." };
  }

  const { error } = await supabase
    .from("user_progress")
    .update({
      rewatch_count: (current.rewatch_count ?? 0) + 1,
      status: "completed",
    })
    .eq("user_id", user.id)
    .eq("anime_id", animeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/anime/${animeId}`);
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Rates a watched episode 1–5 (or clears with null). No-op error when
 * migration 0017 (episode_progress.rating) isn't applied yet.
 */
export async function rateEpisode(
  episodeId: string,
  rating: number | null,
): Promise<UpsertProgressResult> {
  const parsed = z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .safeParse(rating);
  if (!parsed.success) return { ok: false, error: "Invalid rating." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("episode_progress")
    .update({ rating: parsed.data })
    .eq("user_id", user.id)
    .eq("episode_id", episodeId);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * The viewer's episode ratings for an anime as { episodeId: rating }. Returns
 * null when migration 0017 isn't applied (callers hide the rating UI).
 */
export async function getEpisodeRatings(
  animeId: string,
): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episode_progress")
    .select("episode_id, rating, episode:episode_id!inner(anime_id)")
    .eq("episode.anime_id", animeId);
  if (error) return null;

  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.rating != null) out[row.episode_id] = row.rating;
  }
  return out;
}

/** Bulk status change for the library's multi-select mode. Max 100 per call. */
export async function bulkUpdateStatus(
  animeIds: string[],
  status: ProgressPatch["status"],
): Promise<UpsertProgressResult> {
  const parsed = z
    .object({
      animeIds: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum([
        "watching",
        "completed",
        "plan_to_watch",
        "on_hold",
        "dropped",
      ]),
    })
    .safeParse({ animeIds, status });
  if (!parsed.success) {
    return { ok: false, error: "Invalid bulk update." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to edit your library." };
  }

  // UPDATE (not upsert): only rows already in the library change. The
  // user_id filter states the intent the RLS UPDATE policy also enforces —
  // worth being explicit now that SELECT on this table is no longer
  // owner-only (migration 0015).
  const { error } = await supabase
    .from("user_progress")
    .update({ status: parsed.data.status })
    .eq("user_id", user.id)
    .in("anime_id", parsed.data.animeIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/library");
  revalidatePath("/");

  return { ok: true };
}

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
