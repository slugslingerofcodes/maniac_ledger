import type { Tables } from "@/lib/database.types";
import { GENRE_OPTIONS } from "@/lib/genres";
import type { JikanAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * Outage fallbacks backed by our own `anime` catalog (which grows as users
 * browse). When MAL/Jikan is unreachable, search and the random roll fall back
 * to these so the features keep working with local data. RLS applies: the
 * catalog is readable by authenticated users, so callers need a session.
 */

type AnimeRow = Tables<"anime">;

const JIKAN_STATUS: Record<AnimeRow["status"], string> = {
  currently_airing: "Currently Airing",
  finished_airing: "Finished Airing",
  not_yet_aired: "Not yet aired",
  hiatus: "On Hiatus",
  cancelled: "Discontinued",
};

/** Maps a catalog row onto the JikanAnime shape the search/random UIs render. */
function toJikanShape(row: AnimeRow): JikanAnime {
  const imageSet = {
    image_url: row.poster_url,
    small_image_url: row.poster_url,
    large_image_url: row.poster_url,
  };
  return {
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
}

/**
 * Title search over the local catalog (title + english title, best-scored
 * first). Genre ids are translated to names and AND-matched against the
 * row's `genres` array. Returns [] when nothing matches or RLS blocks reads.
 *
 * Hentai-genre rows are excluded: titles added from the miscellaneous (adult)
 * tab live in the same shared catalog, and this function feeds SFW surfaces
 * (the public search API's catalog merge) — mirroring MAL's own `sfw=true`.
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
  const seen = new Set<number>();
  return (data ?? [])
    .filter((row) => {
      if (row.mal_id == null || seen.has(row.mal_id)) return false;
      seen.add(row.mal_id);
      return true;
    })
    .map(toJikanShape);
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

  const seen = new Set<number>();
  return (data ?? [])
    .filter((row) => {
      if (row.mal_id == null || seen.has(row.mal_id)) return false;
      seen.add(row.mal_id);
      return true;
    })
    .map(toJikanShape);
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
  const seen = new Set<number>();
  return (data ?? [])
    .filter((row) => {
      if (row.mal_id == null || seen.has(row.mal_id)) return false;
      seen.add(row.mal_id);
      return true;
    })
    .map(toJikanShape);
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
  return row ? toJikanShape(row) : null;
}
