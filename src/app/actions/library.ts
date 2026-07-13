"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { resolveAndAssignFranchise } from "@/lib/franchise";
import { getAnimeById, type JikanAnime } from "@/lib/jikan";
import { addToLibrary } from "@/lib/library";
import { createClient } from "@/lib/supabase/server";
import type { AnimeType, WatchStatus } from "@/types/anime";

/** A library entry shaped for `LibraryCard` (matches `LibraryCardItem`). */
export type LibraryEntryItem = {
  id: string;
  /** MyAnimeList id — used to match search results against the library. */
  malId: number | null;
  title: string;
  /** English title, when MAL has one — for the title-language preference. */
  titleEnglish: string | null;
  posterUrl: string | null;
  type: AnimeType | null;
  status: WatchStatus;
  episodesWatched: number;
  totalEpisodes: number | null;
  score: number | null;
  /** Genre names for the library filter; empty until backfilled. */
  genres: string[];
};

/**
 * Returns the signed-in user's full library (all statuses), newest first, with
 * per-anime watched counts merged in. Used as the TanStack Query `queryFn` on
 * /library so the result can be cached + persisted to IndexedDB for offline.
 * RLS scopes the rows to the current user.
 */
export async function getUserLibrary(): Promise<LibraryEntryItem[]> {
  const supabase = await createClient();

  let { data, error } = await supabase
    .from("user_progress")
    .select(
      "episodes_watched, status, score, anime:anime_id (id, mal_id, title, title_english, poster_url, type, total_episodes, genres)",
    )
    .order("updated_at", { ascending: false });

  // Migration 0014 not applied yet → retry without genres so the library
  // still loads (the genre filter just has nothing to offer). The cast is safe:
  // the mapper checks `"genres" in row.anime` before reading it.
  if (error && /genres/i.test(error.message)) {
    const retry = await supabase
      .from("user_progress")
      .select(
        "episodes_watched, status, score, anime:anime_id (id, mal_id, title, title_english, poster_url, type, total_episodes)",
      )
      .order("updated_at", { ascending: false });
    data = retry.data as unknown as typeof data;
    error = retry.error;
  }
  if (error) throw new Error(error.message);

  const { data: counts } = await supabase
    .from("anime_watched_count")
    .select("anime_id, watched_count");
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) {
    if (c.anime_id) countMap.set(c.anime_id, c.watched_count ?? 0);
  }

  return (data ?? []).map((row) => ({
    id: row.anime.id,
    malId: row.anime.mal_id,
    title: row.anime.title,
    titleEnglish: row.anime.title_english,
    posterUrl: row.anime.poster_url,
    type: row.anime.type,
    status: row.status,
    episodesWatched: countMap.get(row.anime.id) ?? row.episodes_watched,
    totalEpisodes: row.anime.total_episodes,
    score: row.score,
    genres: "genres" in row.anime ? (row.anime.genres ?? []) : [],
  }));
}

export type AddToLibraryActionResult =
  | { ok: true; alreadyAdded: boolean; animeId: string }
  | { ok: false; error: string };

/**
 * Server Action wrapper around `addToLibrary`. Adds the anime, revalidates the
 * library page so it reflects the new entry, and returns a serializable result
 * the client can use to drive its UI. `opts.isPrivate` (the miscellaneous tab)
 * keeps the entry off the feed, public profiles, and friend views.
 */
export async function addToLibraryAction(
  anime: JikanAnime,
  opts: { isPrivate?: boolean } = {},
): Promise<AddToLibraryActionResult> {
  try {
    const result = await addToLibrary(anime, opts);
    revalidatePath("/library");

    // Only worth resolving on a fresh add — a repeat add hasn't changed the
    // catalog. Runs after the response is sent (Jikan's rate-limited BFS can
    // take seconds) and is strictly best-effort: a failure never affects the add.
    if ("success" in result) {
      after(async () => {
        try {
          const supabase = await createClient();
          await resolveAndAssignFranchise(supabase, anime.mal_id);
        } catch {
          /* best-effort: swallow franchise-resolution failures */
        }
      });
    }

    return {
      ok: true,
      alreadyAdded: "alreadyAdded" in result,
      animeId: result.animeId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to add to library.",
    };
  }
}

export type RemoveFromLibraryResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Removes an anime from the signed-in user's library: deletes their
 * `user_progress` row and any per-episode watch rows for that title. RLS scopes
 * every delete to the current user, so no explicit `user_id` filter is needed
 * (see the RLS note in CLAUDE.md). The shared catalog row is left intact — it's
 * community data other users may still be tracking.
 */
export async function removeFromLibraryAction(
  animeId: string,
): Promise<RemoveFromLibraryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You must be signed in to remove anime." };
  }

  // Best-effort: clear this title's per-episode watch rows first so it doesn't
  // linger in the watched-count view. Scoped to the user by RLS.
  const { data: eps } = await supabase
    .from("episodes")
    .select("id")
    .eq("anime_id", animeId);
  const episodeIds = (eps ?? []).map((e) => e.id);
  if (episodeIds.length > 0) {
    await supabase.from("episode_progress").delete().in("episode_id", episodeIds);
  }

  const { error } = await supabase
    .from("user_progress")
    .delete()
    .eq("anime_id", animeId);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/library");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Adds an anime by MyAnimeList id — for callers (e.g. the recommendations page)
 * that only have a mal_id, not a full JikanAnime. Fetches the record via the
 * Jikan client, then delegates to the same `addToLibrary` core as the search
 * flow, including the post-response franchise resolution.
 */
export async function addToLibraryByMalId(
  malId: number,
): Promise<AddToLibraryActionResult> {
  let anime: JikanAnime;
  try {
    anime = await getAnimeById(malId);
  } catch {
    return { ok: false, error: "Couldn't find that anime on MyAnimeList." };
  }
  return addToLibraryAction(anime);
}
