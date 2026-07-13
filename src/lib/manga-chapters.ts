import { getMangaDexChapters, resolveMangaDexId } from "@/lib/mangadex";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

/** Re-sync window: publishing titles refresh their chapter list daily. */
const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Ensures the shared `manga_chapters` catalog is populated for a manga — and
 * kept fresh, so the list runs "up to the latest ones":
 *
 *  - First detail view: resolves the MangaDex id (strict `links.mal` match,
 *    stored on the row) and backfills the full English chapter list.
 *  - Later views: re-syncs when the last sync is >24h old, unless the title is
 *    finished AND already has rows (its list can't grow).
 *
 * Mirrors `ensureEpisodes`. Best-effort: swallows MangaDex failures so the
 * detail page always renders. Requires migration 0024 and runs under the
 * caller's session (insert policy: any authenticated user).
 */
export async function ensureMangaChapters(row: {
  id: string;
  mal_id: number | null;
  title: string;
  title_english: string | null;
  status: string | null;
  mangadex_id?: string | null;
  chapters_synced_at?: string | null;
}): Promise<void> {
  if (row.mal_id == null) return;

  try {
    const supabase = await createClient();

    // Freshness gate. `finished` uses MAL's manga status string.
    const syncedAt = row.chapters_synced_at
      ? Date.parse(row.chapters_synced_at)
      : null;
    const fresh = syncedAt != null && Date.now() - syncedAt < SYNC_STALE_MS;
    if (fresh) return;
    const finished = (row.status ?? "").toLowerCase() === "finished";
    if (finished && syncedAt != null) return; // full list already synced once

    // Resolve (or reuse) the MangaDex id.
    let mdId = row.mangadex_id ?? null;
    if (!mdId) {
      mdId = await resolveMangaDexId(row.mal_id, [
        row.title,
        row.title_english,
      ]);
      if (!mdId) {
        // No linked MangaDex entry — remember we looked so every page view
        // doesn't re-search; a future sync (>24h) will retry.
        await supabase
          .from("manga")
          .update({ chapters_synced_at: new Date().toISOString() })
          .eq("id", row.id);
        return;
      }
    }

    const chapters = await getMangaDexChapters(mdId);
    if (chapters.length > 0) {
      const rows = chapters.map((c) => ({
        manga_id: row.id,
        number: c.number,
        title: c.title,
        published_at: c.publishedAt,
      }));
      // Dedup on (manga_id, number); rows a concurrent request wrote are skipped.
      await supabase
        .from("manga_chapters")
        .upsert(rows, { onConflict: "manga_id,number", ignoreDuplicates: true });
    }

    await supabase
      .from("manga")
      .update({
        mangadex_id: mdId,
        chapters_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  } catch {
    /* best-effort: MangaDex down / migration 0024 missing — page still renders */
  }
}

export type MangaChapterRow = Pick<
  Tables<"manga_chapters">,
  "number" | "title" | "published_at"
>;

/** The stored chapter list for a manga, in reading order. Best-effort. */
export async function getStoredChapters(
  mangaId: string,
): Promise<MangaChapterRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("manga_chapters")
      .select("number, title, published_at")
      .eq("manga_id", mangaId)
      .order("number", { ascending: true })
      .limit(2000);
    return data ?? [];
  } catch {
    return [];
  }
}
