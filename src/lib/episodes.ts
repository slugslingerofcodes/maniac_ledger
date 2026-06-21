import { getAllAnimeEpisodes } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * Ensures the shared `episodes` catalog is populated for an anime so per-episode
 * tracking has rows to reference.
 *
 * No-op if the anime already has episodes or has no `mal_id`. Otherwise fetches
 * the episode list from Jikan and inserts it, deduped by (anime_id, number).
 * Best-effort: swallows Jikan failures so the detail page still renders.
 *
 * Requires migration 0005 (authenticated INSERT policy on `episodes`) and runs
 * under the caller's session.
 */
export async function ensureEpisodes(
  animeId: string,
  malId: number | null,
): Promise<void> {
  if (malId == null) return;

  const supabase = await createClient();

  // Already populated? Skip the network call.
  const { count } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("anime_id", animeId);

  if ((count ?? 0) > 0) return;

  let episodes;
  try {
    episodes = await getAllAnimeEpisodes(malId);
  } catch {
    return; // Jikan unavailable / rate limited — leave the catalog empty.
  }
  if (episodes.length === 0) return;

  const rows = episodes.map((ep) => ({
    anime_id: animeId,
    number: ep.mal_id,
    title: ep.title,
    // Jikan `aired` is an ISO datetime; our column is a date.
    aired_date: ep.aired ? ep.aired.slice(0, 10) : null,
  }));

  // Dedup on (anime_id, number); ignore rows a concurrent request already wrote.
  await supabase
    .from("episodes")
    .upsert(rows, { onConflict: "anime_id,number", ignoreDuplicates: true });
}
