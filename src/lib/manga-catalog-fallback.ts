import type { Tables } from "@/lib/database.types";
import type { JikanManga, JikanMangaType } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * Outage fallbacks backed by our own `manga` catalog — the manga analog of
 * `catalog-fallback.ts`. The catalog grows as users browse and add manga, so
 * when MAL/Jikan is unreachable, search / popular / detail keep working with
 * local data. RLS applies: readable by authenticated users only.
 */

type MangaRow = Tables<"manga">;

/** Jikan type-filter value → the display string stored on catalog rows. */
const TYPE_LABEL: Record<JikanMangaType, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

/** Maps a catalog row onto the JikanManga shape the manga UIs render. */
export function toJikanMangaShape(row: MangaRow): JikanManga {
  const imageSet = {
    image_url: row.cover_url,
    small_image_url: row.cover_url,
    large_image_url: row.cover_url,
  };
  return {
    mal_id: row.mal_id!,
    title: row.title,
    title_english: row.title_english,
    synopsis: row.synopsis,
    type: row.type,
    chapters: row.chapters,
    volumes: row.volumes,
    status: row.status ?? "Unknown",
    score: row.score,
    images: { jpg: imageSet, webp: imageSet },
    genres: (row.genres ?? []).map((name) => ({
      mal_id: 0,
      type: "genre",
      name,
      url: "",
    })),
    authors: (row.authors ?? []).map((name) => ({
      mal_id: 0,
      type: "people",
      name,
      url: "",
    })),
  };
}

/**
 * Title search over the local manga catalog (title + english title, best-scored
 * first). With an empty query it returns the top-scored rows, so the browse
 * tabs still show something during an outage. Returns [] when nothing matches
 * or RLS blocks reads (no session).
 */
export async function searchMangaCatalog(
  q: string,
  type?: JikanMangaType,
  limit = 50,
): Promise<JikanManga[]> {
  // Strip ilike wildcards and the comma/parens that would break .or() syntax.
  const s = q.replace(/[%_,()]/g, " ").trim();

  const supabase = await createClient();
  let query = supabase
    .from("manga")
    .select("*")
    .not("mal_id", "is", null)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (s) {
    query = query.or(`title.ilike.%${s}%,title_english.ilike.%${s}%`);
  }
  if (type) {
    query = query.eq("type", TYPE_LABEL[type]);
  }

  const { data } = await query;
  const seen = new Set<number>();
  return (data ?? [])
    .filter((row) => {
      if (row.mal_id == null || seen.has(row.mal_id)) return false;
      seen.add(row.mal_id);
      return true;
    })
    .map(toJikanMangaShape);
}

/** Top-scored rows from the local catalog — the "Popular manga" fallback. */
export async function topMangaCatalog(limit = 18): Promise<JikanManga[]> {
  return searchMangaCatalog("", undefined, limit);
}

/** A single catalog row by MAL id, or null — the detail-page fallback. */
export async function catalogMangaByMalId(
  malId: number,
): Promise<MangaRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("manga")
    .select("*")
    .eq("mal_id", malId)
    .maybeSingle();
  return data ?? null;
}
