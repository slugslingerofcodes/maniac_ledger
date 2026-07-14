import { getMangaDexChapters, resolveMangaDexId } from "@/lib/mangadex";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

/** Re-sync window: publishing titles refresh their chapter list daily. */
const SYNC_STALE_MS = 24 * 60 * 60 * 1000;
/** Incomplete lists retry sooner (self-heal), but never more than hourly. */
const RETRY_INCOMPLETE_MS = 60 * 60 * 1000;

/**
 * Ensures the shared `manga_chapters` catalog is populated for a manga — and
 * kept fresh, so the list runs "up to the latest ones":
 *
 *  - First detail view: resolves the MangaDex id (strict `links.mal` match,
 *    stored on the row) and backfills the chapter list — MangaDex's
 *    all-language aggregate for complete numbering, the English feed for
 *    titles, and MAL's own chapter count to fill any remaining integer gaps.
 *  - Later views: re-syncs when the last sync is >24h old; lists that are
 *    still visibly short of MAL's count retry hourly until they catch up.
 *    Titles heal on every re-sync (existing rows are updated, never blanked).
 *
 * Mirrors `ensureEpisodes`. Best-effort: swallows MangaDex failures so the
 * detail page always renders. Requires migration 0024 and runs under the
 * caller's session.
 */
export async function ensureMangaChapters(row: {
  id: string;
  mal_id: number | null;
  title: string;
  title_english: string | null;
  status: string | null;
  /** Media kind — novels have no chapter source, so they're skipped. */
  type?: string | null;
  /** MAL's total chapter count, when known — fills numbering gaps. */
  chapters?: number | null;
  mangadex_id?: string | null;
  chapters_synced_at?: string | null;
}): Promise<void> {
  // Needs at least one key to resolve chapters from.
  if (row.mal_id == null && !row.mangadex_id) return;
  // MangaDex hosts comics, not prose — a light novel "chapter list" from a
  // title search would be its manga adaptation's, i.e. wrong. Novels get a
  // volume list on the detail page instead.
  if ((row.type ?? "").toLowerCase().includes("novel")) return;

  try {
    const supabase = await createClient();

    // How much we already have vs. how much MAL says exists.
    const { count } = await supabase
      .from("manga_chapters")
      .select("id", { count: "exact", head: true })
      .eq("manga_id", row.id);
    const stored = count ?? 0;
    const expected = row.chapters ?? 0;
    const incomplete = expected > 0 ? stored < expected : stored === 0;

    // Freshness gate. `finished` uses MAL's manga status string.
    const syncedAt = row.chapters_synced_at
      ? Date.parse(row.chapters_synced_at)
      : null;
    const age = syncedAt != null ? Date.now() - syncedAt : Infinity;
    if (syncedAt != null) {
      const finished = (row.status ?? "").toLowerCase() === "finished";
      if (incomplete) {
        if (age < RETRY_INCOMPLETE_MS) return; // retried recently — back off
      } else if (finished) {
        return; // complete + finished → the list can't grow
      } else if (age < SYNC_STALE_MS) {
        return; // complete + publishing → daily refresh is enough
      }
    }

    // Resolve (or reuse) the MangaDex id. MangaDex-only rows already carry it.
    let mdId = row.mangadex_id ?? null;
    if (!mdId && row.mal_id != null) {
      mdId = await resolveMangaDexId(row.mal_id, [
        row.title,
        row.title_english,
      ]);
    }

    // Chapter set: MangaDex (numbers + titles) ∪ MAL's integer count.
    const byNumber = new Map<
      number,
      { title: string | null; published_at: string | null }
    >();
    if (mdId) {
      for (const c of await getMangaDexChapters(mdId)) {
        byNumber.set(c.number, { title: c.title, published_at: c.publishedAt });
      }
    }
    for (let n = 1; n <= expected; n++) {
      if (!byNumber.has(n)) byNumber.set(n, { title: null, published_at: null });
    }

    if (byNumber.size > 0) {
      // Never downgrade: keep an already-stored title/date when the fresh
      // fetch has none for that number.
      const { data: existing } = await supabase
        .from("manga_chapters")
        .select("number, title, published_at")
        .eq("manga_id", row.id);
      for (const e of existing ?? []) {
        const fresh = byNumber.get(e.number);
        if (!fresh) continue;
        if (!fresh.title && e.title) fresh.title = e.title;
        if (!fresh.published_at && e.published_at)
          fresh.published_at = e.published_at;
      }

      const rows = [...byNumber.entries()].map(([number, c]) => ({
        manga_id: row.id,
        number,
        title: c.title,
        published_at: c.published_at,
      }));
      // Update on conflict so titles heal; if the UPDATE policy isn't applied
      // yet (pre-re-run 0024), fall back to insert-only so new numbers land.
      const { error } = await supabase
        .from("manga_chapters")
        .upsert(rows, { onConflict: "manga_id,number" });
      if (error) {
        await supabase
          .from("manga_chapters")
          .upsert(rows, { onConflict: "manga_id,number", ignoreDuplicates: true });
      }
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
      .limit(3000);
    return data ?? [];
  } catch {
    return [];
  }
}
