import type { JikanAnime, JikanSeason } from "@/lib/jikan";
import type { WatchStatus } from "@/types/anime";

/** What a card knows about a title's place in the viewer's library. */
export type LibraryEntry = { animeId: string | null; status: WatchStatus };

/**
 * The serializable card payload every home row ships to the client.
 *
 * It carries exactly the fields `upsertCatalogAnime` reads, so a card's quick
 * actions can rebuild a `JikanAnime` and call the existing `addToLibraryAction`
 * without a second upstream lookup. That round trip has to be *lossless*: the
 * catalog upsert overwrites on conflict, so a field dropped here (a `null`
 * synopsis, an empty genre list) would erase what the shared catalog already
 * knew about the title. `tests/lib/browse-item.test.ts` pins the round trip.
 */
export type BrowseItem = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  type: string | null;
  year: number | null;
  episodes: number | null;
  score: number | null;
  synopsis: string | null;
  genres: string[];
  studio: string | null;
  /** Jikan's free-text airing status ("Currently Airing", …). */
  airingStatus: string;
  season: JikanSeason | null;
};

/** Best available poster for a Jikan-shaped record. */
export function posterOfJikan(a: JikanAnime): string | null {
  return a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null;
}

export function toBrowseItem(a: JikanAnime): BrowseItem {
  return {
    malId: a.mal_id,
    title: a.title,
    titleEnglish: a.title_english ?? null,
    posterUrl: posterOfJikan(a),
    type: a.type ?? null,
    year: a.year ?? null,
    episodes: a.episodes ?? null,
    score: a.score ?? null,
    synopsis: a.synopsis ?? null,
    genres: (a.genres ?? []).map((g) => g.name),
    studio: a.studios?.[0]?.name ?? null,
    airingStatus: a.status,
    season: a.season ?? null,
  };
}

/** The inverse of {@link toBrowseItem}, for `addToLibraryAction`. */
export function toJikanAnime(item: BrowseItem): JikanAnime {
  const image = {
    image_url: item.posterUrl,
    small_image_url: item.posterUrl,
    large_image_url: item.posterUrl,
  };
  return {
    mal_id: item.malId,
    title: item.title,
    title_english: item.titleEnglish,
    synopsis: item.synopsis,
    type: item.type,
    episodes: item.episodes,
    score: item.score,
    scored_by: null,
    status: item.airingStatus,
    season: item.season,
    year: item.year,
    images: { jpg: image, webp: image },
    genres: item.genres.map((name) => ({ mal_id: 0, type: "genre", name, url: "" })),
    studios: item.studio
      ? [{ mal_id: 0, type: "studio", name: item.studio, url: "" }]
      : [],
  };
}

/** Dedupe by MAL id, keeping first occurrence (top charts repeat ids). */
export function uniqueByMalId<T extends { malId: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((i) => (seen.has(i.malId) ? false : (seen.add(i.malId), true)));
}

/**
 * YouTube id of a title's trailer, when the record carries one. Jikan list
 * endpoints often fill `embed_url` while leaving `youtube_id` null, so both are
 * read. AniList-served records carry one only when AniList's trailer is on
 * YouTube (`toJikanTrailer` drops Dailymotion); none simply means no preview.
 */
export function trailerYoutubeId(a: JikanAnime): string | null {
  const t = a.trailer;
  if (!t) return null;
  if (t.youtube_id) return t.youtube_id;
  if (!t.embed_url) return null;
  const m = /\/embed\/([\w-]{6,})/.exec(t.embed_url);
  return m ? m[1]! : null;
}
