"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { resolveAndAssignFranchise } from "@/lib/franchise";
import { getAnimeById, type JikanAnime } from "@/lib/jikan";
import { addToLibrary } from "@/lib/library";
import { createClient } from "@/lib/supabase/server";

export type AddToLibraryActionResult =
  | { ok: true; alreadyAdded: boolean; animeId: string }
  | { ok: false; error: string };

/**
 * Server Action wrapper around `addToLibrary`. Adds the anime, revalidates the
 * library page so it reflects the new entry, and returns a serializable result
 * the client can use to drive its UI.
 */
export async function addToLibraryAction(
  anime: JikanAnime,
): Promise<AddToLibraryActionResult> {
  try {
    const result = await addToLibrary(anime);
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
