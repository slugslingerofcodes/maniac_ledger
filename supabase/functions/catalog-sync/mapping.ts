// catalog-sync — the pure half: upstream records → catalog rows and charts.
//
// No Deno APIs and no imports, on purpose: index.ts (Deno) imports this as
// "./mapping.ts", and the app's Vitest suite imports it directly
// (tests/functions/catalog-sync-mapping.test.ts) — so the mapping that decides
// what every page reads is tested on every `npm run verify`, even though the
// function itself runs on another runtime.
//
// Every value written here lands in a typed Postgres column through
// `catalog_sync_apply` (migration 0030), and one bad value fails the whole
// batch: an enum the type doesn't have, a score of 85, an end date before the
// start. So the mappers validate rather than pass through, and anything they
// can't vouch for becomes null — which the RPC treats as "keep what's there".

/* -------------------------------------------------------------------------- */
/* Catalog row (mirrors public.anime; enums as in 0001)                       */
/* -------------------------------------------------------------------------- */

export type AiringStatus =
  | "not_yet_aired"
  | "currently_airing"
  | "finished_airing"
  | "hiatus"
  | "cancelled";
export type ContentRating = "g" | "pg" | "pg_13" | "r_17" | "r_plus" | "rx";
export type AnimeSeason = "winter" | "spring" | "summer" | "fall";
export type AnimeType = "tv" | "movie" | "ova" | "ona" | "special" | "music";

export type CatalogRow = {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_synonyms: string[];
  synopsis: string | null;
  poster_url: string | null;
  banner_url: string | null;
  trailer_youtube_id: string | null;
  score: number | null;
  members: number | null;
  studio: string | null;
  total_episodes: number | null;
  duration_mins: number | null;
  status: AiringStatus | null;
  airing_start: string | null;
  airing_end: string | null;
  rating: ContentRating | null;
  season: AnimeSeason | null;
  year: number | null;
  type: AnimeType | null;
  genres: string[];
  broadcast_day: string | null;
  broadcast_time: string | null;
};

/* -------------------------------------------------------------------------- */
/* Small validators                                                           */
/* -------------------------------------------------------------------------- */

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Unique non-empty strings, in order, capped (a few titles carry dozens). */
function strings(list: unknown, cap = 20): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const s = str(item);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** 0–10, two decimals (the column is numeric(4,2)). */
function score(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) return null;
  return Math.round(v * 100) / 100;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Any ISO-ish timestamp → `YYYY-MM-DD`, or null. */
export function isoDay(v: unknown): string | null {
  const m = typeof v === "string" ? ISO_DATE.exec(v) : null;
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1900 || year > 2200) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** The airing window as a pair the `airing_end >= airing_start` check accepts. */
function airingWindow(from: string | null, to: string | null) {
  // Lexical order is date order for YYYY-MM-DD.
  return { airing_start: from, airing_end: from && to && to < from ? null : to };
}

const YOUTUBE_ID = /^[\w-]{6,20}$/;

/** A trailer's YouTube id, from the id itself or an embed URL. */
export function youtubeId(id: unknown, embedUrl?: unknown): string | null {
  const direct = str(id);
  if (direct && YOUTUBE_ID.test(direct)) return direct;
  const m = typeof embedUrl === "string" ? /\/embed\/([\w-]{6,20})/.exec(embedUrl) : null;
  return m ? m[1]! : null;
}

/** "24 min per ep" → 24, "1 hr 52 min" → 112, "2 hr" → 120; null otherwise. */
export function parseDurationMins(duration: unknown): number | null {
  if (typeof duration !== "string") return null;
  const hr = /(\d+)\s*hr/.exec(duration);
  const min = /(\d+)\s*min/.exec(duration);
  if (!hr && !min) return null;
  const total = (hr ? Number(hr[1]) * 60 : 0) + (min ? Number(min[1]) : 0);
  return total > 0 && total < 10_000 ? total : null;
}

/* -------------------------------------------------------------------------- */
/* Jikan (MyAnimeList)                                                        */
/* -------------------------------------------------------------------------- */

/** The slice of a Jikan v4 anime record this reads. Everything is optional: trust nothing. */
export type JikanRecord = {
  mal_id?: unknown;
  title?: unknown;
  title_english?: unknown;
  title_synonyms?: unknown;
  synopsis?: unknown;
  type?: unknown;
  episodes?: unknown;
  duration?: unknown;
  score?: unknown;
  members?: unknown;
  status?: unknown;
  rating?: unknown;
  season?: unknown;
  year?: unknown;
  aired?: { from?: unknown; to?: unknown } | null;
  broadcast?: { day?: unknown; time?: unknown } | null;
  trailer?: { youtube_id?: unknown; embed_url?: unknown } | null;
  images?: { jpg?: { image_url?: unknown; large_image_url?: unknown } | null } | null;
  genres?: { name?: unknown }[] | null;
  explicit_genres?: { name?: unknown }[] | null;
  studios?: { name?: unknown }[] | null;
};

const JIKAN_STATUS: Record<string, AiringStatus> = {
  "Finished Airing": "finished_airing",
  "Currently Airing": "currently_airing",
  "Not yet aired": "not_yet_aired",
};

const JIKAN_TYPE: Record<string, AnimeType> = {
  TV: "tv",
  "TV Special": "special",
  Movie: "movie",
  OVA: "ova",
  ONA: "ona",
  Special: "special",
  Music: "music",
};

/** Jikan's ratings are prose: "PG-13 - Teens 13 or older". */
const JIKAN_RATING: Record<string, ContentRating> = {
  g: "g",
  pg: "pg",
  "pg-13": "pg_13",
  r: "r_17",
  "r+": "r_plus",
  rx: "rx",
};

const SEASONS = new Set<AnimeSeason>(["winter", "spring", "summer", "fall"]);
const BROADCAST_DAY = /^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)days$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function season(v: unknown): AnimeSeason | null {
  const s = str(v)?.toLowerCase();
  return s && SEASONS.has(s as AnimeSeason) ? (s as AnimeSeason) : null;
}

const names = (list: unknown) =>
  Array.isArray(list) ? strings(list.map((g) => (g as { name?: unknown })?.name)) : [];

/** A Jikan record → a catalog row; null for records with no id or no title. */
export function fromJikan(a: JikanRecord): CatalogRow | null {
  const mal_id = int(a?.mal_id, 1, 2_147_483_647);
  const title = str(a?.title);
  if (mal_id == null || !title) return null;

  const start = isoDay(a.aired?.from);
  const day = str(a.broadcast?.day);
  const time = str(a.broadcast?.time);
  const ratingHead = str(a.rating)?.split(" - ")[0]?.trim().toLowerCase();

  return {
    mal_id,
    title,
    title_english: str(a.title_english),
    title_synonyms: strings(a.title_synonyms),
    synopsis: str(a.synopsis),
    poster_url: str(a.images?.jpg?.large_image_url) ?? str(a.images?.jpg?.image_url),
    // MAL has no landscape art; AniList fills this in the merge.
    banner_url: null,
    trailer_youtube_id: youtubeId(a.trailer?.youtube_id, a.trailer?.embed_url),
    score: score(a.score),
    members: int(a.members, 0, 2_147_483_647),
    studio: names(a.studios)[0] ?? null,
    total_episodes: int(a.episodes, 0, 100_000),
    duration_mins: parseDurationMins(a.duration),
    status: JIKAN_STATUS[str(a.status) ?? ""] ?? null,
    ...airingWindow(start, isoDay(a.aired?.to)),
    rating: (ratingHead && JIKAN_RATING[ratingHead]) || null,
    season: season(a.season),
    // Jikan leaves `year` null for anything off the seasonal calendar
    // (movies, OVAs); the premiere date still knows it.
    year: int(a.year, 1900, 2200) ?? (start ? Number(start.slice(0, 4)) : null),
    // An unmapped kind ("CM", "PV") is null: on insert the column default
    // applies, and an existing row keeps its own.
    type: JIKAN_TYPE[str(a.type) ?? ""] ?? null,
    // Explicit genres too: "Hentai" lives there, and the SFW exclusion every
    // catalog read applies keys on it.
    genres: strings([...names(a.genres), ...names(a.explicit_genres)]),
    broadcast_day: day && BROADCAST_DAY.test(day) ? day : null,
    broadcast_time: time && HH_MM.test(time) ? time : null,
  };
}

/* -------------------------------------------------------------------------- */
/* AniList                                                                    */
/* -------------------------------------------------------------------------- */

type FuzzyDate = { year?: unknown; month?: unknown; day?: unknown } | null;

export type AnilistRecord = {
  id?: unknown;
  idMal?: unknown;
  isAdult?: unknown;
  title?: { romaji?: unknown; english?: unknown } | null;
  synonyms?: unknown;
  description?: unknown;
  format?: unknown;
  status?: unknown;
  episodes?: unknown;
  duration?: unknown;
  averageScore?: unknown;
  popularity?: unknown;
  season?: unknown;
  seasonYear?: unknown;
  startDate?: FuzzyDate;
  endDate?: FuzzyDate;
  coverImage?: { extraLarge?: unknown; large?: unknown } | null;
  bannerImage?: unknown;
  genres?: unknown;
  studios?: { nodes?: { name?: unknown }[] | null } | null;
  trailer?: { id?: unknown; site?: unknown } | null;
  nextAiringEpisode?: { airingAt?: unknown } | null;
};

/** The GraphQL selection that yields an {@link AnilistRecord}. */
export const ANILIST_MEDIA_FIELDS = `
  id idMal isAdult
  title { romaji english }
  synonyms description format status episodes duration
  averageScore popularity season seasonYear
  startDate { year month day } endDate { year month day }
  coverImage { extraLarge large }
  bannerImage genres
  studios(isMain: true) { nodes { name } }
  trailer { id site }
  nextAiringEpisode { airingAt }
`;

const ANILIST_STATUS: Record<string, AiringStatus> = {
  FINISHED: "finished_airing",
  RELEASING: "currently_airing",
  NOT_YET_RELEASED: "not_yet_aired",
  CANCELLED: "cancelled",
  HIATUS: "hiatus",
};

const ANILIST_FORMAT: Record<string, AnimeType> = {
  TV: "tv",
  TV_SHORT: "tv",
  MOVIE: "movie",
  SPECIAL: "special",
  OVA: "ova",
  ONA: "ona",
  MUSIC: "music",
};

/** AniList descriptions are HTML; the app renders plain text (as anilist.ts does). */
function stripHtml(html: unknown): string | null {
  const s = str(html);
  if (!s) return null;
  return (
    s
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim() || null
  );
}

function fuzzyDay(d: FuzzyDate | undefined): string | null {
  const year = int(d?.year, 1900, 2200);
  const month = int(d?.month, 1, 12);
  const day = int(d?.day, 1, 31);
  if (year == null || month == null || day == null) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const JST_DAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
] as const;

/**
 * A unix airing time → the Jikan-style JST slot the schedule UIs read
 * ("Saturdays", "23:00"), the same derivation as getAnilistAiringSchedule.
 */
export function jstSlot(airingAt: unknown): { day: string; time: string } | null {
  if (typeof airingAt !== "number" || !Number.isFinite(airingAt) || airingAt <= 0) return null;
  const jst = new Date(airingAt * 1000 + JST_OFFSET_MS);
  return {
    day: JST_DAYS[jst.getUTCDay()]!,
    time: `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/** An AniList media record → a catalog row; null without a MAL id, or if adult. */
export function fromAnilist(m: AnilistRecord): CatalogRow | null {
  const mal_id = int(m?.idMal, 1, 2_147_483_647);
  const title = str(m?.title?.romaji) ?? str(m?.title?.english);
  // Adult media never enters through the sync: it only asks for isAdult:false,
  // and this keeps a mislabelled record out regardless.
  if (mal_id == null || !title || m.isAdult === true) return null;

  const start = fuzzyDay(m.startDate);
  const slot = jstSlot(m.nextAiringEpisode?.airingAt);
  const average = typeof m.averageScore === "number" ? m.averageScore / 10 : null;
  const trailerSite = str(m.trailer?.site)?.toLowerCase();

  return {
    mal_id,
    title,
    title_english: str(m.title?.english),
    title_synonyms: strings(m.synonyms),
    synopsis: stripHtml(m.description),
    poster_url: str(m.coverImage?.extraLarge) ?? str(m.coverImage?.large),
    banner_url: str(m.bannerImage),
    // The players embed YouTube; a Dailymotion trailer counts as none.
    trailer_youtube_id: trailerSite === "youtube" ? youtubeId(m.trailer?.id) : null,
    score: score(average),
    members: int(m.popularity, 0, 2_147_483_647),
    studio: names(m.studios?.nodes)[0] ?? null,
    total_episodes: int(m.episodes, 0, 100_000),
    duration_mins: int(m.duration, 1, 10_000),
    status: ANILIST_STATUS[str(m.status) ?? ""] ?? null,
    ...airingWindow(start, fuzzyDay(m.endDate)),
    // AniList has no age rating; a MAL view of the title supplies it.
    rating: null,
    season: season(m.season),
    year: int(m.seasonYear, 1900, 2200) ?? int(m.startDate?.year, 1900, 2200),
    type: ANILIST_FORMAT[str(m.format) ?? ""] ?? null,
    genres: strings(m.genres),
    broadcast_day: slot?.day ?? null,
    broadcast_time: slot?.time ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Merge                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One title as both engines see it. MAL wins wherever it has a value — it is
 * the app's primary engine, its ids key the catalog, and its score is the one
 * the UI shows. AniList fills what MAL lacks (banner art always; a trailer,
 * broadcast slot or genres when MAL has none) and stands in alone when MAL was
 * unreachable for the whole run.
 */
export function mergeRows(mal: CatalogRow | undefined, anilist: CatalogRow | undefined): CatalogRow | undefined {
  if (!mal || !anilist) return mal ?? anilist;
  const pick = <K extends keyof CatalogRow>(key: K): CatalogRow[K] => mal[key] ?? anilist[key];
  return {
    mal_id: mal.mal_id,
    title: mal.title,
    title_english: pick("title_english"),
    title_synonyms: strings([...mal.title_synonyms, ...anilist.title_synonyms]),
    synopsis: pick("synopsis"),
    poster_url: pick("poster_url"),
    banner_url: anilist.banner_url ?? mal.banner_url,
    trailer_youtube_id: pick("trailer_youtube_id"),
    score: pick("score"),
    members: pick("members"),
    studio: pick("studio"),
    total_episodes: pick("total_episodes"),
    duration_mins: pick("duration_mins"),
    status: pick("status"),
    // The window moves as a pair, from whichever engine knows the start.
    ...(mal.airing_start
      ? { airing_start: mal.airing_start, airing_end: mal.airing_end }
      : { airing_start: anilist.airing_start, airing_end: anilist.airing_end }),
    rating: pick("rating"),
    season: pick("season"),
    year: pick("year"),
    type: pick("type"),
    genres: mal.genres.length > 0 ? mal.genres : anilist.genres,
    // Day and time as a pair too, or a show could get MAL's day and AniList's hour.
    ...(mal.broadcast_day
      ? { broadcast_day: mal.broadcast_day, broadcast_time: mal.broadcast_time }
      : { broadcast_day: anilist.broadcast_day, broadcast_time: anilist.broadcast_time }),
  };
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every chart the app reads, by `catalog_lists.key`. The app side names the
 * same keys in src/lib/catalog.ts (`CatalogListKey`); a test pins the two.
 */
export const LIST_KEYS = [
  "airing",
  "season-now",
  "popular",
  "top-rated",
  "upcoming",
  "top-movies",
  "just-finished",
  "top10-weekly",
  "top10-monthly",
  "top10-yearly",
  "schedule",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

/** How many ids a chart keeps; the schedule is every slotted airing show. */
export const LIST_CAP: Record<ListKey, number> = {
  airing: 50,
  "season-now": 50,
  popular: 50,
  "top-rated": 50,
  upcoming: 50,
  "top-movies": 50,
  "just-finished": 50,
  "top10-weekly": 25,
  "top10-monthly": 25,
  "top10-yearly": 25,
  schedule: 200,
};

export type ListSnapshot = { key: ListKey; mal_ids: number[]; source: "mal" | "anilist" };

/** Rows in upstream order → unique ids, capped; rows the mapper refused drop out. */
export function chartIds(rows: (CatalogRow | null)[], cap: number): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (row && !ids.includes(row.mal_id)) ids.push(row.mal_id);
    if (ids.length >= cap) break;
  }
  return ids;
}

/** Re-rank by viewers (the Top 10's axis), as getTopTen does; stable for ties. */
export function byMembers(rows: (CatalogRow | null)[]): CatalogRow[] {
  return rows
    .filter((r): r is CatalogRow => r != null)
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (b.row.members ?? 0) - (a.row.members ?? 0) || a.i - b.i)
    .map(({ row }) => row);
}

/**
 * The chart each key publishes this run: MAL's when MAL answered with
 * anything, AniList's otherwise, and none at all when both came back empty —
 * an empty snapshot is never written, so the previous one ages out instead of
 * blanking a rail on one bad run.
 */
export function pickLists(
  mal: Partial<Record<ListKey, (CatalogRow | null)[]>>,
  anilist: Partial<Record<ListKey, (CatalogRow | null)[]>>,
): ListSnapshot[] {
  const out: ListSnapshot[] = [];
  for (const key of LIST_KEYS) {
    const fromMal = chartIds(mal[key] ?? [], LIST_CAP[key]);
    if (fromMal.length > 0) {
      out.push({ key, mal_ids: fromMal, source: "mal" });
      continue;
    }
    const fromAnilist = chartIds(anilist[key] ?? [], LIST_CAP[key]);
    if (fromAnilist.length > 0) out.push({ key, mal_ids: fromAnilist, source: "anilist" });
  }
  return out;
}

/** Every row either engine produced, merged per title. */
export function mergeAll(malRows: (CatalogRow | null)[], anilistRows: (CatalogRow | null)[]): CatalogRow[] {
  const mal = new Map<number, CatalogRow>();
  for (const r of malRows) if (r) mal.set(r.mal_id, mergeRows(mal.get(r.mal_id), r) ?? r);
  const anilist = new Map<number, CatalogRow>();
  for (const r of anilistRows) if (r) anilist.set(r.mal_id, mergeRows(anilist.get(r.mal_id), r) ?? r);
  const out: CatalogRow[] = [];
  for (const id of new Set([...mal.keys(), ...anilist.keys()])) {
    const row = mergeRows(mal.get(id), anilist.get(id));
    if (row) out.push(row);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* What to ask for                                                            */
/* -------------------------------------------------------------------------- */

/** The anime season a date falls in (winter = Jan–Mar … fall = Oct–Dec). */
export function seasonOf(date: Date): AnimeSeason {
  return (["winter", "spring", "summer", "fall"] as const)[Math.floor(date.getUTCMonth() / 3)]!;
}

const fuzzyInt = (d: Date) =>
  d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

/** One Jikan chart: a path and how many 25-row pages of it. */
export type JikanChart = { key: ListKey; path: string; pages: number };

/**
 * The MAL side, mirroring the calls src/lib/jikan.ts makes for each surface
 * (so a rail shows the same chart whichever tier served it). ~23 requests.
 */
export function jikanCharts(now: Date): JikanChart[] {
  const year = now.getUTCFullYear();
  return [
    { key: "airing", path: "/top/anime?filter=airing&sfw=true", pages: 2 },
    { key: "season-now", path: "/seasons/now?sfw=true", pages: 2 },
    { key: "popular", path: "/top/anime?filter=bypopularity&sfw=true", pages: 2 },
    { key: "top-rated", path: "/top/anime?sfw=true", pages: 2 },
    { key: "upcoming", path: "/seasons/upcoming?sfw=true", pages: 2 },
    { key: "top-movies", path: "/top/anime?type=movie&sfw=true", pages: 2 },
    {
      key: "just-finished",
      path: "/anime?status=complete&order_by=end_date&sort=desc&min_score=6&sfw=true",
      pages: 1,
    },
    {
      key: "top10-weekly",
      path: "/anime?order_by=members&sort=desc&status=airing&sfw=true",
      pages: 1,
    },
    {
      key: "top10-yearly",
      path: `/anime?order_by=members&sort=desc&start_date=${year}-01-01&end_date=${year}-12-31&sfw=true`,
      pages: 1,
    },
    // Up to 8 pages: the whole broadcast grid (stops early at the last page).
    { key: "schedule", path: "/schedules?kids=false&sfw=true", pages: 8 },
  ];
}

/** One AniList page, as an aliased `Page` in a batched GraphQL document. */
export type AnilistChart = { key: ListKey; page: number; args: string };

/**
 * The AniList side: the same charts as the app's AniList fallbacks, 50 per
 * page. Batched several to a request by {@link anilistDocument}, so a whole
 * run is ~3 requests against a 30/min limit.
 */
export function anilistCharts(now: Date): AnilistChart[] {
  const year = now.getUTCFullYear();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const base = "type: ANIME, isAdult: false";
  return [
    // RELEASING by popularity serves three keys: airing (page 1), the weekly
    // Top 10, and — every page, with nextAiringEpisode — the schedule.
    { key: "schedule", page: 1, args: `${base}, status: RELEASING, sort: POPULARITY_DESC` },
    { key: "schedule", page: 2, args: `${base}, status: RELEASING, sort: POPULARITY_DESC` },
    { key: "schedule", page: 3, args: `${base}, status: RELEASING, sort: POPULARITY_DESC` },
    {
      key: "season-now",
      page: 1,
      args: `${base}, season: ${seasonOf(now).toUpperCase()}, seasonYear: ${year}, sort: POPULARITY_DESC`,
    },
    { key: "popular", page: 1, args: `${base}, sort: POPULARITY_DESC` },
    { key: "top-rated", page: 1, args: `${base}, sort: SCORE_DESC` },
    { key: "upcoming", page: 1, args: `${base}, status: NOT_YET_RELEASED, sort: POPULARITY_DESC` },
    { key: "top-movies", page: 1, args: `${base}, format: MOVIE, sort: POPULARITY_DESC` },
    {
      key: "just-finished",
      page: 1,
      args: `${base}, status: FINISHED, endDate_greater: ${fuzzyInt(ninetyDaysAgo)}, sort: POPULARITY_DESC`,
    },
    {
      key: "top10-yearly",
      page: 1,
      args: `${base}, startDate_greater: ${year * 10_000}, startDate_lesser: ${(year + 1) * 10_000}, sort: POPULARITY_DESC`,
    },
  ];
}

/** Pages per GraphQL request: ~35 complexity each against AniList's cap of 500. */
export const ANILIST_PAGES_PER_REQUEST = 4;

/** An aliased multi-`Page` document (`p0`, `p1`, …) for one batch. */
export function anilistDocument(batch: AnilistChart[]): string {
  const pages = batch
    .map(
      (c, i) =>
        `p${i}: Page(page: ${c.page}, perPage: 50) { media(${c.args}) { ${ANILIST_MEDIA_FIELDS} } }`,
    )
    .join("\n");
  return `query {\n${pages}\n}`;
}

/**
 * AniList pages → each key's rows. The RELEASING pages fan out: page 1 is the
 * airing chart and the weekly Top 10's pool, all of them the schedule (only
 * titles with a next episode can be placed on it).
 */
export function anilistLists(
  pages: { chart: AnilistChart; rows: (CatalogRow | null)[] }[],
): Partial<Record<ListKey, (CatalogRow | null)[]>> {
  const lists: Partial<Record<ListKey, (CatalogRow | null)[]>> = {};
  const push = (key: ListKey, rows: (CatalogRow | null)[]) => {
    lists[key] = [...(lists[key] ?? []), ...rows];
  };
  const ordered = [...pages].sort((a, b) => a.chart.page - b.chart.page);
  for (const { chart, rows } of ordered) {
    if (chart.key === "schedule") {
      if (chart.page === 1) {
        push("airing", rows);
        push("top10-weekly", byMembers(rows));
      }
      push("schedule", rows.filter((r) => r?.broadcast_day));
      continue;
    }
    push(chart.key, chart.key === "top10-yearly" ? byMembers(rows) : rows);
    if (chart.key === "season-now") push("top10-monthly", byMembers(rows));
  }
  return lists;
}

/**
 * Jikan pages → each key's rows. `/seasons/now` doubles as the monthly Top 10
 * (re-ranked by viewers, as getTopTen does).
 */
export function jikanLists(
  pages: { chart: JikanChart; rows: (CatalogRow | null)[] }[],
): Partial<Record<ListKey, (CatalogRow | null)[]>> {
  const lists: Partial<Record<ListKey, (CatalogRow | null)[]>> = {};
  for (const { chart, rows } of pages) {
    const kept = chart.key === "schedule" ? rows.filter((r) => r?.broadcast_day) : rows;
    lists[chart.key] = [...(lists[chart.key] ?? []), ...kept];
  }
  for (const key of ["top10-weekly", "top10-yearly"] as const) {
    if (lists[key]) lists[key] = byMembers(lists[key]!);
  }
  if (lists["season-now"]) lists["top10-monthly"] = byMembers(lists["season-now"]);
  return lists;
}
