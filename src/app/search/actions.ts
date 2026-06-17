"use server";

import { createClient } from "@/lib/supabase/server";

export type AddToLibraryInput = {
  malId: number;
  title: string;
  image: string | null;
  synopsis: string | null;
  episodes: number | null;
};

export type AddToLibraryResult =
  | { ok: true; status: "added" | "already_in_library" }
  | { ok: false; error: string };

/**
 * Adds a search result to the signed-in user's library.
 *
 * 1. Ensures the anime exists in the shared catalog, deduped by `mal_id`
 *    (requires migration 0002: the mal_id column + the authenticated INSERT
 *    policy on `anime`).
 * 2. Inserts a `user_progress` row (user_id defaults to auth.uid(), status
 *    defaults to 'plan_to_watch'). The unique (user_id, anime_id) constraint
 *    makes re-adding a no-op.
 */
export async function addToLibrary(
  input: AddToLibraryInput,
): Promise<AddToLibraryResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to add anime." };
  }

  // 1. Resolve (or create) the catalog row for this MAL id.
  let animeId: string;
  const { data: existing, error: selectError } = await supabase
    .from("anime")
    .select("id")
    .eq("mal_id", input.malId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, error: selectError.message };
  }

  if (existing) {
    animeId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("anime")
      .insert({
        mal_id: input.malId,
        title: input.title,
        synopsis: input.synopsis,
        poster_url: input.image,
        total_episodes: input.episodes,
      })
      .select("id")
      .single();

    if (insertError) {
      // 23505 = another request inserted the same mal_id first; re-fetch it.
      if (insertError.code === "23505") {
        const { data: raced } = await supabase
          .from("anime")
          .select("id")
          .eq("mal_id", input.malId)
          .single();
        if (!raced) {
          return { ok: false, error: "Could not add this anime to the catalog." };
        }
        animeId = raced.id;
      } else {
        return { ok: false, error: insertError.message };
      }
    } else {
      animeId = inserted.id;
    }
  }

  // 2. Add it to the user's library.
  const { error: progressError } = await supabase
    .from("user_progress")
    .insert({ anime_id: animeId });

  if (progressError) {
    // Already tracked (unique user_id + anime_id) — treat as success.
    if (progressError.code === "23505") {
      return { ok: true, status: "already_in_library" };
    }
    return { ok: false, error: progressError.message };
  }

  return { ok: true, status: "added" };
}
