import { getAllAnimeEpisodes } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * Ensures the shared `episodes` catalog is populated — and, for currently
 * airing anime, **topped up** — so per-episode tracking has rows to reference.
 *
 * Finished shows: no-op once rows exist (their episode list never changes).
 * Airing shows: re-fetches the list from Jikan on every detail view (the
 * episodes endpoint is uncached) and inserts any newly aired episodes, so the
 * count stays exact as new episodes drop.
 *
 * No-op without a `mal_id`. Best-effort: swallows Jikan failures so the detail
 * page still renders. Requires migration 0005 (authenticated INSERT policy on
 * `episodes`) and runs under the caller's session.
 */
export async function ensureEpisodes(
  animeId: string,
  malId: number | null,
  opts: { airing?: boolean } = {},
): Promise<void> {
  if (malId == null) return;

  const supabase = await createClient();

  const { count } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("anime_id", animeId);
  const existing = count ?? 0;

  // Finished + already populated → the list can't have changed.
  if (existing > 0 && !opts.airing) return;

  let episodes;
  try {
    episodes = await getAllAnimeEpisodes(malId);
  } catch {
    return; // Jikan unavailable / rate limited — keep what we have.
  }
  // Nothing new to write (also covers Jikan briefly returning fewer rows).
  if (episodes.length === 0 || episodes.length <= existing) return;

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
