import type { Tables } from "@/lib/database.types";
import { GENRE_OPTIONS } from "@/lib/genres";
import type { JikanAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads over our own `anime` catalog. It started as the outage fallback (and
 * grew only as users browsed); since 0030 a scheduled sync keeps it stocked
 * with every chart the UI shows, so search reads it *first* and the live
 * engines enrich. RLS applies: the catalog is readable by authenticated users,
 * so callers need a session.
 */

type AnimeRow = Tables<"anime">;

const JIKAN_STATUS: Record<AnimeRow["status"], string> = {
  currently_airing: "Currently Airing",
  finished_airing: "Finished Airing",
  not_yet_aired: "Not yet aired",
  hiatus: "On Hiatus",
  cancelled: "Discontinued",
};

/**
 * Maps a catalog row onto the JikanAnime shape every list UI renders.
 *
 * Synced rows (0030) carry what the UI used to need a live call for — the
 * banner's trailer, landscape art and broadcast slot, synonyms for matching,
 * members for the Top 10 — so those are emitted in Jikan's own fields when
 * present, and absent (like on a sparse Jikan record) when not.
 */
export function catalogRowToJikan(row: AnimeRow): JikanAnime {
  const imageSet = {
    image_url: row.poster_url,
    small_image_url: row.poster_url,
    large_image_url: row.poster_url,
  };
  const anime: JikanAnime = {
    mal_id: row.mal_id!,
    title: row.title,
    title_english: row.title_english,
    synopsis: row.synopsis,
    type: row.type,
    episodes: row.total_episodes,
    score: row.score,
    scored_by: null,
    status: JIKAN_STATUS[row.status] ?? row.status,
    season: row.season,
    year: row.year,
    images: { jpg: imageSet, webp: imageSet },
    genres: (row.genres ?? []).map((name) => ({
      mal_id: 0,
      type: "genre",
      name,
      url: "",
    })),
    studios: row.studio
      ? [{ mal_id: 0, type: "studio", name: row.studio, url: "" }]
      : [],
  };
  // `?.length` rather than a truthiness check: rows from before 0030, or from a
  // partial select, have no such column at all.
  if (row.title_synonyms?.length) anime.title_synonyms = row.title_synonyms;
  if (row.members != null) anime.members = row.members;
  if (row.duration_mins != null) anime.duration = `${row.duration_mins} min per ep`;
  if (row.banner_url) anime.banner_image = row.banner_url;
  if (row.trailer_youtube_id) {
    anime.trailer = {
      youtube_id: row.trailer_youtube_id,
      url: `https://www.youtube.com/watch?v=${row.trailer_youtube_id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${row.trailer_youtube_id}`,
    };
  }
  if (row.broadcast_day) {
    anime.broadcast = {
      day: row.broadcast_day,
      time: row.broadcast_time ?? null,
      timezone: "Asia/Tokyo",
      string: null,
    };
  }
  if (row.airing_start || row.airing_end) {
    anime.aired = { from: row.airing_start, to: row.airing_end };
  }
  return anime;
}

/**
 * PostgREST's code for "no such function" — the RPCs arrive with migration
 * 0030, and the app ships before or after it. Remembered per process for a
 * while, so each search doesn't pay a round trip to learn it again.
 */
export const RPC_MISSING = "PGRST202";
export const RPC_MISSING_RETRY_MS = 10 * 60_000;
let searchRpcMissingUntil = 0;

/** Forget a remembered missing RPC. Tests only. */
export function __resetCatalogSearchMemo(): void {
  searchRpcMissingUntil = 0;
}

/** Catalog rows → JikanAnime, deduped by mal_id (rows without one have no detail route). */
export function catalogRowsToJikan(rows: AnimeRow[] | null | undefined): JikanAnime[] {
  const seen = new Set<number>();
  return (rows ?? [])
    .filter((row) => {
      if (row.mal_id == null || seen.has(row.mal_id)) return false;
      seen.add(row.mal_id);
      return true;
    })
    .map(catalogRowToJikan);
}

/**
 * Title search over the local catalog. Genre ids are translated to names and
 * AND-matched against the row's `genres` array. Returns [] when nothing
 * matches or RLS blocks reads.
 *
 * Ranked by `search_anime_catalog` (0030): exact title, then prefix, word
 * prefix, substring and finally a fuzzy (trigram) match, popularity within
 * each — over titles, English titles *and* synonyms, so "aot" finds Attack on
 * Titan. Until 0030 is applied the RPC doesn't exist, and this falls back to
 * the older substring match ranked by score.
 *
 * Hentai-genre rows are excluded either way: titles added from the
 * miscellaneous (adult) tab live in the same shared catalog, and this feeds SFW
 * surfaces (the search API) — mirroring MAL's own `sfw=true`.
 */
export async function searchCatalog(
  q: string,
  genreIds: number[] = [],
  limit = 50,
): Promise<JikanAnime[]> {
  // Strip ilike wildcards and the comma/parens that would break .or() syntax.
  const s = q.replace(/[%_,()]/g, " ").trim();
  const genreNames = genreIds
    .map((id) => GENRE_OPTIONS.find((g) => g.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (!s && genreNames.length === 0) return [];

  const supabase = await createClient();

  if (Date.now() >= searchRpcMissingUntil) {
    // The RPC escapes wildcards itself, so it gets the query as typed.
    const ranked = await supabase.rpc("search_anime_catalog", {
      q: q.trim(),
      genre_names: genreNames,
      max_results: Math.min(limit, 50),
    });
    if (!ranked.error && Array.isArray(ranked.data)) {
      return catalogRowsToJikan(ranked.data as unknown as AnimeRow[]);
    }
    if (ranked.error?.code === RPC_MISSING) {
      searchRpcMissingUntil = Date.now() + RPC_MISSING_RETRY_MS;
    }
  }

  let query = supabase
    .from("anime")
    .select("*")
    .not("mal_id", "is", null)
    .not("genres", "cs", "{Hentai}")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (s) {
    query = query.or(`title.ilike.%${s}%,title_english.ilike.%${s}%`);
  }
  if (genreNames.length > 0) {
    query = query.contains("genres", genreNames);
  }

  const { data } = await query;
  return catalogRowsToJikan(data);
}

/**
 * The catalog's best-scored titles — the browse counterpart to
 * {@link searchCatalog}, for surfaces that show "top anime" with no query
 * (e.g. the posters tab's empty state) when every live engine is down.
 * Same exclusions as search: SFW only, mal_id required.
 */
export async function browseCatalog(limit = 24): Promise<JikanAnime[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("anime")
    .select("*")
    .not("mal_id", "is", null)
    .not("genres", "cs", "{Hentai}")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  return catalogRowsToJikan(data);
}

/** Misc-tab mode → the MAL genre names stored on catalog rows. */
const ADULT_GENRE_NAMES: Record<"ecchi" | "hentai" | "both", string[]> = {
  ecchi: ["Ecchi"],
  hentai: ["Hentai"],
  both: ["Ecchi", "Hentai"],
};

/**
 * Adult-title search over the local catalog — the last-resort fallback for the
 * miscellaneous tab when both MAL and AniList are down. Matches rows whose
 * `genres` array overlaps the mode's genre names (OR semantics), optionally
 * narrowed by a title substring. Only returns what users have already
 * browsed/added, best-scored first.
 */
export async function searchAdultCatalog(
  q: string,
  mode: "ecchi" | "hentai" | "both" = "both",
  limit = 50,
): Promise<JikanAnime[]> {
  const s = q.replace(/[%_,()]/g, " ").trim();

  const supabase = await createClient();
  let query = supabase
    .from("anime")
    .select("*")
    .not("mal_id", "is", null)
    .overlaps("genres", ADULT_GENRE_NAMES[mode])
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (s) {
    query = query.or(`title.ilike.%${s}%,title_english.ilike.%${s}%`);
  }

  const { data } = await query;
  return catalogRowsToJikan(data);
}

/**
 * A random row from the local catalog, or null when it's empty/unreadable.
 * Excludes Hentai-genre rows, matching MAL's `/random/anime?sfw=true`.
 */
export async function randomCatalogAnime(): Promise<JikanAnime | null> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("anime")
    .select("id", { count: "exact", head: true })
    .not("mal_id", "is", null)
    .not("genres", "cs", "{Hentai}");
  if (!count) return null;

  const offset = Math.floor(Math.random() * count);
  const { data } = await supabase
    .from("anime")
    .select("*")
    .not("mal_id", "is", null)
    .not("genres", "cs", "{Hentai}")
    .range(offset, offset);

  const row = data?.[0];
  return row ? catalogRowToJikan(row) : null;
}
