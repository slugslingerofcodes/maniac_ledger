import { getAnimeById, type JikanAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";
import type { AiringStatus } from "@/types/anime";

/** The request-scoped Supabase server client (RLS runs as the signed-in user). */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AddToLibraryResult =
  | { success: true; animeId: string }
  | { alreadyAdded: true; animeId: string };

// Jikan reports airing state as free text; map it onto our airing_status enum.
const JIKAN_STATUS_TO_AIRING: Record<string, AiringStatus> = {
  "Finished Airing": "finished_airing",
  "Currently Airing": "currently_airing",
  "Not yet aired": "not_yet_aired",
};

function posterOf(anime: JikanAnime): string | null {
  return (
    anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url ?? null
  );
}

/**
 * Upserts the shared catalog row for a Jikan anime (deduped by `mal_id`,
 * refreshing metadata on repeat) and returns its catalog uuid. The caller must
 * be a signed-in user — the catalog INSERT policy (migration 0002) requires it.
 */
export async function upsertCatalogAnime(
  supabase: ServerClient,
  jikanAnime: JikanAnime,
): Promise<string> {
  const row = {
    mal_id: jikanAnime.mal_id,
    title: jikanAnime.title,
    title_english: jikanAnime.title_english,
    synopsis: jikanAnime.synopsis,
    total_episodes: jikanAnime.episodes,
    poster_url: posterOf(jikanAnime),
    score: jikanAnime.score,
    status: JIKAN_STATUS_TO_AIRING[jikanAnime.status] ?? "finished_airing",
    year: jikanAnime.year,
    studio: jikanAnime.studios?.[0]?.name ?? null,
    genres: (jikanAnime.genres ?? []).map((g) => g.name),
  };

  let { data, error } = await supabase
    .from("anime")
    .upsert(row, { onConflict: "mal_id" })
    .select("id")
    .single();

  // Migration 0014 not applied yet → retry without the genres column so adds
  // keep working; genres simply stay empty until the migration runs.
  if (error && /genres/i.test(error.message)) {
    const { genres: _genres, ...withoutGenres } = row;
    ({ data, error } = await supabase
      .from("anime")
      .upsert(withoutGenres, { onConflict: "mal_id" })
      .select("id")
      .single());
  }

  // Row already cataloged and the UPDATE policy (0014) isn't in place → the
  // upsert's conflict-update path is RLS-denied. The add itself only needs the
  // id, so fall back to reading the existing row; metadata refresh is skipped.
  if (error && /row-level security/i.test(error.message)) {
    const { data: existing } = await supabase
      .from("anime")
      .select("id")
      .eq("mal_id", jikanAnime.mal_id)
      .maybeSingle();
    if (existing) return existing.id;
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save this anime to the catalog.");
  }
  return data.id;
}

/**
 * Resolves a MyAnimeList id to a catalog uuid so it can be opened on the
 * `/anime/[id]` detail page. Returns the existing row's id if the anime is
 * already in the shared catalog; otherwise backfills it from Jikan first.
 * Used by the `/anime/mal/[malId]` redirect (e.g. clicking a search result).
 */
export async function resolveAnimeIdByMalId(malId: number): Promise<string> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("anime")
    .select("id")
    .eq("mal_id", malId)
    .maybeSingle();
  if (existing) return existing.id;

  // Not in the catalog yet — fetch from Jikan and contribute it.
  const jikanAnime = await getAnimeById(malId);
  return upsertCatalogAnime(supabase, jikanAnime);
}

/**
 * Adds an anime (from a Jikan search result) to the signed-in user's library.
 *
 * 1. Upserts the shared catalog row, deduped by `mal_id` (requires migrations
 *    0002 for the mal_id column/insert policy and 0003 for the extra metadata
 *    columns).
 * 2. Inserts a `user_progress` row for the user (status 'plan_to_watch',
 *    0 episodes watched). If they're already tracking it, returns
 *    `{ alreadyAdded: true }` rather than throwing.
 *
 * Uses the request-scoped Supabase server client, so RLS runs as the signed-in
 * user. Throws if there is no session or on an unexpected database error.
 */
export async function addToLibrary(
  jikanAnime: JikanAnime,
): Promise<AddToLibraryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("You must be signed in to add anime to your library.");
  }

  // 1. Upsert the catalog row, deduped by mal_id. Refreshes metadata on repeat.
  const animeId = await upsertCatalogAnime(supabase, jikanAnime);

  // 2. Add it to the user's library.
  const { error: progressError } = await supabase.from("user_progress").insert({
    user_id: user.id,
    anime_id: animeId,
    status: "plan_to_watch",
    episodes_watched: 0,
  });

  if (progressError) {
    // 23505 = unique (user_id, anime_id) violation → already in their library.
    if (progressError.code === "23505") {
      return { alreadyAdded: true, animeId };
    }
    throw new Error(progressError.message);
  }

  return { success: true, animeId };
}
