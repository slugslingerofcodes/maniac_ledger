import { malGenresToAnilist, searchAnilist } from "@/lib/anilist";
import { toBrowseItem, uniqueByMalId, type BrowseItem } from "@/lib/browse-item";
import type { Tables } from "@/lib/database.types";
import { GENRE_OPTIONS } from "@/lib/genres";
import type { LibrarySnapshotRow } from "@/lib/library-snapshot";
import { createClient } from "@/lib/supabase/server";

/**
 * "Because you watched X" — one personalized row, built only from data the app
 * already has: the viewer's library (for the seed and the exclusions), the
 * shared Supabase catalog, and AniList. **No Jikan:** it is rate-limited and
 * slow in production, and this row must never be the reason the page waits.
 *
 * The selection is two pure steps, kept separate from the I/O so they can be
 * pinned by tests:
 *
 *  1. {@link pickSeed} — which library title to anchor on.
 *  2. {@link rankSimilar} — which candidates to show, and in what order.
 */

/** Below this, the row isn't worth a slot on the page. */
export const MIN_ROW_ITEMS = 4;
const ROW_LIMIT = 18;
/** A rating at or below this means "didn't like it" — never a seed. */
const DISLIKED_AT_OR_BELOW = 5;

/* -------------------------------------------------------------------------- */
/* 1. Seed                                                                    */
/* -------------------------------------------------------------------------- */

/** Fields the seed choice reads (a subset of the library snapshot row). */
export type SeedCandidate = Pick<
  LibrarySnapshotRow,
  | "malId"
  | "title"
  | "titleEnglish"
  | "genres"
  | "franchiseId"
  | "status"
  | "score"
  | "episodesWatched"
  | "lastWatchedAt"
  | "updatedAt"
>;

function watchedEnough(r: SeedCandidate): boolean {
  if (r.status === "watching" || r.status === "completed") return true;
  // On hold after some episodes is still "watched"; plan-to-watch and dropped
  // are not — recommending off a show you abandoned gets it backwards.
  return r.status === "on_hold" && r.episodesWatched > 0;
}

function activityTime(r: SeedCandidate): number {
  const t = Date.parse(r.lastWatchedAt ?? r.updatedAt ?? "");
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The library title to anchor the row on: the most recently active one the
 * viewer actually watched, has genres for, and didn't rate poorly. Ties break
 * on the viewer's own rating, then title, so the choice is stable across
 * renders. `null` when nothing qualifies — the row then doesn't render.
 */
export function pickSeed<T extends SeedCandidate>(rows: T[]): T | null {
  const eligible = rows.filter(
    (r) =>
      r.malId != null &&
      r.genres.length > 0 &&
      watchedEnough(r) &&
      !(r.score != null && r.score <= DISLIKED_AT_OR_BELOW),
  );
  eligible.sort(
    (a, b) =>
      activityTime(b) - activityTime(a) ||
      (b.score ?? 0) - (a.score ?? 0) ||
      a.title.localeCompare(b.title),
  );
  return eligible[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* 2. Ranking                                                                 */
/* -------------------------------------------------------------------------- */

/** MAL and AniList name one genre differently; compare on a shared key. */
const GENRE_ALIASES: Record<string, string> = { thriller: "suspense" };

function genreKey(name: string): string {
  const k = name.trim().toLowerCase();
  return GENRE_ALIASES[k] ?? k;
}

/** Season / part / sequel markers that don't change which series a title is. */
const SEQUEL_WORDS =
  /\b(season|part|cour|the movie|movie|film|final|ova|ona|special|specials|\d+(st|nd|rd|th)|\d+|ii|iii|iv|v|vi)\b/g;

/** "Sousou no Frieren 2nd Season" → "sousou no frieren". */
export function seriesKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[:：\-–—(]/)[0]!
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SEQUEL_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Titled = { title: string; titleEnglish: string | null };

/**
 * Whether two titles are the same series (a sequel, a second cour, the movie).
 * Recommending season 2 of the show you're watching isn't a recommendation;
 * the catalog's `franchise_id` catches most of these, but only for titles
 * someone has added, so this name heuristic covers the rest. A prefix match
 * must end on a word boundary and be at least four characters, so "Mob Psycho"
 * doesn't swallow "Mobile Suit Gundam".
 */
export function isSameSeries(a: Titled, b: Titled): boolean {
  const keysA = [a.title, a.titleEnglish].filter(Boolean).map((t) => seriesKey(t!));
  const keysB = [b.title, b.titleEnglish].filter(Boolean).map((t) => seriesKey(t!));
  for (const x of keysA) {
    for (const y of keysB) {
      if (x.length < 4 || y.length < 4) continue;
      if (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `)) return true;
    }
  }
  return false;
}

/**
 * Order candidates by how much they share with the seed: genre overlap first,
 * then score, then MAL id for a stable order.
 *
 * Excluded: anything already in the library, the seed's franchise, and the
 * seed's own series by name. A candidate must share at least two genres with
 * the seed (or its only one) — a single shared "Comedy" is how a row of
 * unrelated shows gets labelled "because you watched".
 *
 * One title per series: the best-ranked entry stands for its franchise. A row
 * that spends two of its first three slots on two cours of the same show is
 * recommending one thing twice.
 */
export function rankSimilar(
  seed: Titled & { genres: string[] },
  candidates: BrowseItem[],
  exclude: Set<number>,
  limit = ROW_LIMIT,
): BrowseItem[] {
  const seedGenres = new Set(seed.genres.map(genreKey));
  const needed = Math.min(2, seedGenres.size);
  if (needed === 0) return [];

  const ranked = uniqueByMalId(candidates)
    .filter((c) => !exclude.has(c.malId) && !isSameSeries(c, seed))
    .map((c) => ({
      c,
      overlap: new Set(c.genres.map(genreKey).filter((g) => seedGenres.has(g))).size,
    }))
    .filter(({ overlap }) => overlap >= needed)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        (b.c.score ?? 0) - (a.c.score ?? 0) ||
        a.c.malId - b.c.malId,
    );

  const picked: BrowseItem[] = [];
  for (const { c } of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((p) => isSameSeries(p, c))) continue;
    picked.push(c);
  }
  return picked;
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

const CATALOG_AIRING_TEXT: Record<Tables<"anime">["status"], string> = {
  currently_airing: "Currently Airing",
  finished_airing: "Finished Airing",
  not_yet_aired: "Not yet aired",
  hiatus: "On Hiatus",
  cancelled: "Discontinued",
};

/** Catalog enum → the casing MAL uses on screen ("tv" → "TV"). */
function displayType(type: string | null): string | null {
  if (!type) return null;
  return type.length <= 3 ? type.toUpperCase() : type[0]!.toUpperCase() + type.slice(1);
}

type CatalogRow = Pick<
  Tables<"anime">,
  | "mal_id"
  | "title"
  | "title_english"
  | "poster_url"
  | "type"
  | "year"
  | "total_episodes"
  | "score"
  | "synopsis"
  | "genres"
  | "studio"
  | "status"
  | "season"
>;

function catalogToItem(row: CatalogRow): BrowseItem {
  return {
    malId: row.mal_id!,
    title: row.title,
    titleEnglish: row.title_english,
    posterUrl: row.poster_url,
    type: displayType(row.type),
    year: row.year,
    episodes: row.total_episodes,
    score: row.score,
    synopsis: row.synopsis,
    genres: row.genres ?? [],
    studio: row.studio,
    airingStatus: CATALOG_AIRING_TEXT[row.status] ?? "Finished Airing",
    season: row.season,
  };
}

/** Catalog titles sharing any seed genre, best-scored first. One ~50ms query. */
async function fromCatalog(genres: string[]): Promise<BrowseItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("anime")
    .select(
      "mal_id, title, title_english, poster_url, type, year, total_episodes, score, synopsis, genres, studio, status, season",
    )
    .not("mal_id", "is", null)
    .not("genres", "cs", "{Hentai}")
    .overlaps("genres", genres)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(80);
  return (data ?? []).filter((r) => r.mal_id != null).map(catalogToItem);
}

/** mal_ids of the seed's franchise (sequels the catalog has grouped). */
async function franchiseMalIds(franchiseId: string | null): Promise<number[]> {
  if (!franchiseId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("anime")
    .select("mal_id")
    .eq("franchise_id", franchiseId);
  return (data ?? []).map((r) => r.mal_id).filter((id): id is number => id != null);
}

/** Seed genre names → MAL ids that AniList can filter on as *genres* (not tags). */
export function anilistGenreIds(genres: string[]): number[] {
  const keys = new Set(genres.map(genreKey));
  return GENRE_OPTIONS.filter((g) => keys.has(genreKey(g.name)))
    .map((g) => g.id)
    .filter((id) => malGenresToAnilist([id]).genres.length > 0)
    .slice(0, 3);
}

/** AniList's best-scored titles in any seed genre. */
async function fromAnilist(genres: string[]): Promise<BrowseItem[]> {
  const genreIds = anilistGenreIds(genres);
  if (genreIds.length === 0) return [];
  const res = await searchAnilist({ genreIds, sort: "SCORE_DESC" }, 1);
  return res.data.map(toBrowseItem);
}

/**
 * How long the row waits for AniList before going with the catalog alone.
 * AniList runs a 2.1s-spaced queue that the other home rows also feed, so on a
 * cold cache this call can sit behind several of theirs; the catalog answers in
 * one round trip. The AniList call keeps running and warms its cache for the
 * next visit.
 */
export const ANILIST_WAIT_MS = 4_000;

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export type BecauseYouWatched = {
  seed: { malId: number; title: string; titleEnglish: string | null };
  items: BrowseItem[];
};

/**
 * The row's data, or `null` when there's no seed or too little to show.
 * Catalog and AniList run in parallel; either failing just narrows the pool.
 * Never throws.
 */
export async function getBecauseYouWatched(
  library: LibrarySnapshotRow[],
): Promise<BecauseYouWatched | null> {
  const seed = pickSeed(library);
  if (!seed) return null;

  const [catalog, anilist, franchise] = await Promise.all([
    fromCatalog(seed.genres).catch(() => [] as BrowseItem[]),
    within(fromAnilist(seed.genres), ANILIST_WAIT_MS, [] as BrowseItem[]),
    franchiseMalIds(seed.franchiseId).catch(() => [] as number[]),
  ]);

  const exclude = new Set<number>(franchise);
  for (const r of library) if (r.malId != null) exclude.add(r.malId);

  // AniList first so its fresher record wins the dedupe for shared titles.
  const items = rankSimilar(seed, [...anilist, ...catalog], exclude);
  if (items.length < MIN_ROW_ITEMS) return null;

  return {
    seed: { malId: seed.malId!, title: seed.title, titleEnglish: seed.titleEnglish },
    items,
  };
}
