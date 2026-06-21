"use server";

import { revalidatePath } from "next/cache";

import type { JikanAnime } from "@/lib/jikan";
import { addToLibrary } from "@/lib/library";

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
