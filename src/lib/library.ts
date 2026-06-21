import type { JikanAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";
import type { AiringStatus } from "@/types/anime";

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
  const { data: anime, error: upsertError } = await supabase
    .from("anime")
    .upsert(
      {
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
      },
      { onConflict: "mal_id" },
    )
    .select("id")
    .single();

  if (upsertError || !anime) {
    throw new Error(
      upsertError?.message ?? "Could not save this anime to the catalog.",
    );
  }

  // 2. Add it to the user's library.
  const { error: progressError } = await supabase.from("user_progress").insert({
    user_id: user.id,
    anime_id: anime.id,
    status: "plan_to_watch",
    episodes_watched: 0,
  });

  if (progressError) {
    // 23505 = unique (user_id, anime_id) violation → already in their library.
    if (progressError.code === "23505") {
      return { alreadyAdded: true, animeId: anime.id };
    }
    throw new Error(progressError.message);
  }

  return { success: true, animeId: anime.id };
}
