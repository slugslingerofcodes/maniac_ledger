/**
 * Typed client for the Jikan v4 API (https://api.jikan.moe/v4) — the unofficial
 * MyAnimeList REST API.
 *
 * Rate limits: Jikan allows roughly 3 requests/second (and ~60/minute). To stay
 * inside that budget, every request funnels through a small serial queue that
 * spaces calls at least `MIN_REQUEST_INTERVAL_MS` apart. For UI that fires on
 * keystrokes (a search box), wrap your handler with the exported `debounce`
 * helper so you aren't issuing a request per character.
 */

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

/** ~3 req/sec → space requests ~350ms apart. */
const MIN_REQUEST_INTERVAL_MS = 350;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface JikanImageSet {
  image_url: string | null;
  small_image_url: string | null;
  large_image_url: string | null;
}

export interface JikanImages {
  jpg: JikanImageSet;
  webp: JikanImageSet;
}

/** Shape shared by genres, studios, producers, etc. */
export interface JikanNamedEntity {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

export type JikanAiringStatus =
  | "Finished Airing"
  | "Currently Airing"
  | "Not yet aired";

export type JikanSeason = "winter" | "spring" | "summer" | "fall";

/** Weekly broadcast slot, e.g. `{ day: "Saturdays", time: "23:00", ... }`. */
export interface JikanBroadcast {
  day: string | null;
  time: string | null;
  timezone: string | null;
  string: string | null;
}

/** Airing window. For upcoming anime `from`/`to` are often null. */
export interface JikanAiredDates {
  from: string | null;
  to: string | null;
}

/** Promo video (usually YouTube). All fields may be null when none exists. */
export interface JikanTrailer {
  youtube_id: string | null;
  url: string | null;
  embed_url: string | null;
}

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  /** Alternative titles and fan nicknames (e.g. "AoT", "SnK"). */
  title_synonyms?: string[];
  synopsis: string | null;
  /** Media kind, e.g. "TV", "Movie", "OVA". Widened to string for forward-compat. */
  type?: string | null;
  /** Human string like "24 min per ep"; present on most list endpoints. */
  duration?: string | null;
  episodes: number | null;
  score: number | null;
  scored_by: number | null;
  /** How many MAL users have the title in their list — the "viewers" metric. */
  members?: number | null;
  /** e.g. "Finished Airing"; widened to string for forward-compatibility. */
  status: JikanAiringStatus | string;
  season: JikanSeason | null;
  year: number | null;
  images: JikanImages;
  genres: JikanNamedEntity[];
  studios: JikanNamedEntity[];
  /** Present on season/schedule endpoints; optional elsewhere. */
  broadcast?: JikanBroadcast;
  aired?: JikanAiredDates;
  /** Present on the by-id endpoints; optional elsewhere. */
  trailer?: JikanTrailer;
  /** Present on the `/full` endpoint: prequels, sequels, side stories, etc. */
  relations?: JikanRelationGroup[];
  /** OP/ED credits as display strings, e.g. `1: "Song" by Artist (eps 1–12)`. */
  theme?: { openings: string[]; endings: string[] };
}

/** One group of related entries, e.g. `{ relation: "Sequel", entry: [...] }`. */
export interface JikanRelationGroup {
  relation: string;
  entry: JikanNamedEntity[];
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: {
    count: number;
    total: number;
    per_page: number;
  };
}

/** `/anime` search responses are paginated. */
export interface JikanSearchResponse {
  data: JikanAnime[];
  pagination: JikanPagination;
}

/** `/anime/{id}/full` wraps a single record under `data`. */
export interface JikanByIdResponse {
  data: JikanAnime;
}

/** A single episode from `/anime/{id}/episodes`. `mal_id` is the episode number. */
export interface JikanEpisode {
  mal_id: number;
  title: string | null;
  aired: string | null;
  filler: boolean;
  recap: boolean;
}

export interface JikanEpisodesResponse {
  data: JikanEpisode[];
  pagination: JikanPagination;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** Thrown for any non-2xx response. `status` is the HTTP status code. */
export class JikanError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "JikanError";
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastRequestAt = 0;
// Serial chain that gates every request so they never fire closer together
// than MIN_REQUEST_INTERVAL_MS, regardless of how many callers race.
let chain: Promise<unknown> = Promise.resolve();

function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  // Keep the chain alive even if this task rejects, so one failure doesn't
  // wedge every subsequent request.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Classic trailing-edge debounce. Use it to throttle search-as-you-type so a
 * burst of keystrokes results in a single Jikan call after the user pauses.
 *
 * @example
 *   const onType = debounce((q: string) => runSearch(q), 350);
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  delayMs: number = MIN_REQUEST_INTERVAL_MS,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/* -------------------------------------------------------------------------- */
/* Core fetch                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Last successful payload per path — served when Jikan/MAL is down so features
 * degrade to stale data instead of erroring. In-memory (helps warm serverless
 * instances and dev); Next's Data Cache provides the durable layer on top via
 * `revalidate` (expired entries are served stale while background revalidation
 * fails). `/random/*` is excluded: a "random" that repeats isn't random.
 */
const LAST_GOOD_MAX = 500;
const lastGood = new Map<string, unknown>();

function rememberLastGood(path: string, value: unknown) {
  if (lastGood.has(path)) lastGood.delete(path);
  lastGood.set(path, value);
  if (lastGood.size > LAST_GOOD_MAX) {
    const oldest = lastGood.keys().next().value;
    if (oldest != null) lastGood.delete(oldest);
  }
}

async function jikanFetch<T>(
  path: string,
  // Opt into Next's Data Cache for endpoints that change slowly (e.g. the
  // upcoming season). Omitted → default fetch behavior.
  opts?: { revalidate?: number },
): Promise<T> {
  const fallbackEligible = !path.startsWith("/random");
  return rateLimited(async () => {
    try {
      const res = await fetch(`${JIKAN_BASE_URL}${path}`, {
        headers: { Accept: "application/json" },
        ...(opts?.revalidate != null
          ? { next: { revalidate: opts.revalidate } }
          : {}),
      });

      if (!res.ok) {
        // Jikan returns a JSON error body ({ status, type, message }) for most
        // failures; fall back to statusText if it isn't JSON.
        let detail = res.statusText;
        try {
          const body = (await res.json()) as {
            message?: string;
            error?: string;
          };
          detail = body.message ?? body.error ?? detail;
        } catch {
          /* non-JSON error body — keep statusText */
        }
        throw new JikanError(
          res.status,
          `Jikan request failed (${res.status}): ${detail}`,
        );
      }

      const body = (await res.json()) as T;
      if (fallbackEligible) rememberLastGood(path, body);
      return body;
    } catch (err) {
      // Serve the last-good copy through outages; rate limits (429) still
      // throw so callers can back off instead of masking the signal.
      if (fallbackEligible && !(err instanceof JikanError && err.status === 429)) {
        const cached = lastGood.get(path);
        if (cached !== undefined) {
          console.warn(`[jikan] upstream failed; serving last-good ${path}`);
          return cached as T;
        }
      }
      throw err;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Extra `/anime` search filters Jikan can express natively. */
export type JikanSearchOptions = {
  /** Media kind: tv / movie / ova / ona / special / music. */
  type?: string;
  /** Airing status: airing / complete / upcoming. */
  status?: string;
  /** Premiere window, YYYY-MM-DD (maps year / year-range filters). */
  startDate?: string;
  endDate?: string;
};

/**
 * Search anime by title, MAL genre ids, and/or extra filters. SFW results only.
 *
 * With an empty query but genres/filters set, this becomes a browse — Jikan
 * supports `/anime` without `q`, so results are ordered by member count to
 * surface well-known titles first.
 *
 * @param query    Free-text title query (e.g. "Frieren"); may be empty when
 *                 `genreIds` or `opts` filters are non-empty.
 * @param page     1-based page number (Jikan returns 25 results/page).
 * @param genreIds MAL genre/theme/demographic ids to require (AND semantics).
 * @param opts     Format / airing status / premiere-date-window filters.
 * @returns The matching anime plus pagination metadata.
 * @throws {JikanError} On any non-2xx response (e.g. 429 when rate limited).
 */
export function searchAnime(
  query: string,
  page = 1,
  genreIds: number[] = [],
  opts: JikanSearchOptions = {},
): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({
    sfw: "true",
    page: String(page),
  });
  if (query) params.set("q", query);
  if (genreIds.length > 0) params.set("genres", genreIds.join(","));
  if (opts.type) params.set("type", opts.type);
  if (opts.status) params.set("status", opts.status);
  if (opts.startDate) params.set("start_date", opts.startDate);
  if (opts.endDate) params.set("end_date", opts.endDate);
  const hasFilters =
    genreIds.length > 0 ||
    Boolean(opts.type || opts.status || opts.startDate || opts.endDate);
  if (!query && hasFilters) {
    // Pure browse: rank by popularity, not Jikan's default id order.
    params.set("order_by", "members");
    params.set("sort", "desc");
  }
  // Cached 1h: repeat queries are instant, and cached queries keep working
  // (served stale) through MAL outages.
  return jikanFetch<JikanSearchResponse>(`/anime?${params.toString()}`, {
    revalidate: ONE_HOUR_SECONDS,
  });
}

/** MAL genre ids for the adult "miscellaneous" section. */
export const MAL_GENRE_ECCHI = 9;
export const MAL_GENRE_HENTAI = 12;

/**
 * Search the adult MAL catalog with **SFW filtering OFF** — powers the
 * login-gated "miscellaneous" (ecchi / hentai) section. Same shape and
 * pagination as {@link searchAnime}; with no query it browses by MAL member
 * count so the best-known titles surface first. Pass the ecchi and/or hentai
 * genre id(s) to constrain the catalog.
 *
 * @throws {JikanError} On any non-2xx response (e.g. 429 when rate limited).
 */
export function searchAdultAnime(
  query: string,
  page = 1,
  genreIds: number[] = [],
): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({ sfw: "false", page: String(page) });
  if (query) params.set("q", query);
  if (genreIds.length > 0) params.set("genres", genreIds.join(","));
  if (!query) {
    params.set("order_by", "members");
    params.set("sort", "desc");
  }
  return jikanFetch<JikanSearchResponse>(`/anime?${params.toString()}`, {
    revalidate: ONE_HOUR_SECONDS,
  });
}

/** ~3 req/sec → space requests ~350ms apart; cache windows in seconds. */
const ONE_DAY_SECONDS = 86_400;
const ONE_HOUR_SECONDS = 3_600;
const THIRTY_MIN_SECONDS = 1_800;

/**
 * Anime scheduled for upcoming seasons (`/seasons/upcoming`), concatenated
 * across `pages` and deduped by `mal_id` — Jikan caps each page at 25, so one
 * page rarely spans more than a season or two. Each page is cached in Next's
 * Data Cache for 24h since the slate changes at most daily.
 *
 * @param pages Number of 25-result pages to fetch (stops early at the last page).
 * @throws {JikanError} On any non-2xx response.
 */
export async function getUpcomingSeasons(pages = 2): Promise<JikanAnime[]> {
  const seen = new Set<number>();
  const all: JikanAnime[] = [];
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({ page: String(page) });
    const res = await jikanFetch<JikanSearchResponse>(
      `/seasons/upcoming?${params.toString()}`,
      { revalidate: ONE_DAY_SECONDS },
    );
    for (const a of res.data) {
      if (seen.has(a.mal_id)) continue;
      seen.add(a.mal_id);
      all.push(a);
    }
    if (!res.pagination.has_next_page) break;
  }
  return all;
}

/**
 * Top / trending anime (`/top/anime`). Defaults to currently-airing so the set
 * feels current. Cached in Next's Data Cache for 24h. Used for the library
 * backdrop poster wall.
 *
 * @param limit Max results (Jikan caps the page at 25).
 * @throws {JikanError} On any non-2xx response.
 */
export function getTopAnime(limit = 24): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({
    filter: "airing",
    limit: String(limit),
  });
  return jikanFetch<JikanSearchResponse>(`/top/anime?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/**
 * Ranking window for the home-page Top-10 lists, ranked by **viewers** (MAL
 * `members` — how many users have the title in their list). Jikan/MAL has no
 * literal week/month/year charts, so each maps to the closest real slice:
 *  - weekly  → currently-airing, most viewers
 *  - monthly → this season, most viewers
 *  - yearly  → this calendar year, most viewers
 */
export type TopWindow = "weekly" | "monthly" | "yearly";

export async function getTopTen(window: TopWindow): Promise<JikanAnime[]> {
  let path: string;
  if (window === "weekly") {
    const params = new URLSearchParams({
      order_by: "members",
      sort: "desc",
      status: "airing",
      limit: "10",
      sfw: "true",
    });
    path = `/anime?${params.toString()}`;
  } else if (window === "monthly") {
    path = "/seasons/now?limit=25&sfw=true";
  } else {
    const year = new Date().getFullYear();
    const params = new URLSearchParams({
      order_by: "members",
      sort: "desc",
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      limit: "10",
      sfw: "true",
    });
    path = `/anime?${params.toString()}`;
  }

  const res = await jikanFetch<JikanSearchResponse>(path, {
    revalidate: ONE_DAY_SECONDS,
  });

  // Dedupe (Jikan can repeat ids) and rank by viewer count — the seasonal feed
  // arrives unordered for our purposes, and it costs nothing for the others.
  const seen = new Set<number>();
  const unique = res.data.filter((a) => {
    if (seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
  unique.sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
  return unique.slice(0, 10);
}

/** Six hours — the airing schedule shifts more often than the top charts. */
const SIX_HOURS_SECONDS = 21_600;

/**
 * Currently-airing anime with their weekly broadcast slot (`/schedules`),
 * concatenated across pages and deduped by `mal_id`. Each record's
 * `broadcast.day`/`broadcast.time` is the JST air slot the schedule page and
 * next-episode countdowns are built from.
 */
export async function getSchedules(pages = 3): Promise<JikanAnime[]> {
  const seen = new Set<number>();
  const all: JikanAnime[] = [];
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      sfw: "true",
      kids: "false",
    });
    const res = await jikanFetch<JikanSearchResponse>(
      `/schedules?${params.toString()}`,
      { revalidate: SIX_HOURS_SECONDS },
    );
    for (const a of res.data) {
      if (seen.has(a.mal_id)) continue;
      seen.add(a.mal_id);
      all.push(a);
    }
    if (!res.pagination.has_next_page) break;
  }
  return all;
}

/** This season's simulcasts (`/seasons/now`). Cached 24h. */
export function getSeasonNow(limit = 18): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({ limit: String(limit), sfw: "true" });
  return jikanFetch<JikanSearchResponse>(`/seasons/now?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/** Most-popular anime by MAL member count (`/top/anime?filter=bypopularity`). Cached 24h. */
export function getTopByPopularity(limit = 18): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({
    filter: "bypopularity",
    limit: String(limit),
  });
  return jikanFetch<JikanSearchResponse>(`/top/anime?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/** All-time highest-rated anime (`/top/anime`, MAL rank order). Cached 24h. */
export function getTopRated(limit = 18): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return jikanFetch<JikanSearchResponse>(`/top/anime?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/**
 * Recently finished shows: completed anime, newest end date first, with a
 * score floor so the list isn't shovelware. Cached 24h.
 */
export function getJustFinished(limit = 8): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({
    status: "complete",
    order_by: "end_date",
    sort: "desc",
    min_score: "6",
    sfw: "true",
    limit: String(limit),
  });
  return jikanFetch<JikanSearchResponse>(`/anime?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/**
 * The full weekly airing board for the schedule page. Two sources are merged so
 * long-runners and shows *continuing from a previous season* aren't dropped:
 *
 *  1. `/schedules` — the broadcast grid, fetched across **all** pages (the old
 *     3-page cap silently truncated ~half the currently-airing set).
 *  2. `/seasons/now` — this season's simulcasts, which reliably include
 *     continuing series; any with a broadcast slot that `/schedules` missed are
 *     folded in.
 *
 * Deduped by `mal_id` (schedule entry wins). Cached 6h. Best-effort on the
 * season merge — a failure there still returns the schedule set.
 */
export async function getAiringSchedule(): Promise<JikanAnime[]> {
  const seen = new Set<number>();
  const all: JikanAnime[] = [];
  const add = (list: JikanAnime[]) => {
    for (const a of list) {
      if (seen.has(a.mal_id)) continue;
      seen.add(a.mal_id);
      all.push(a);
    }
  };

  // 1) Whole broadcast grid — loop until the last page (cap 8 to bound the
  //    serial rate-limited fetch well under the serverless function timeout).
  for (let page = 1; page <= 8; page++) {
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      sfw: "true",
      kids: "false",
    });
    const res = await jikanFetch<JikanSearchResponse>(
      `/schedules?${params.toString()}`,
      { revalidate: SIX_HOURS_SECONDS },
    );
    add(res.data);
    if (!res.pagination.has_next_page) break;
  }

  // 2) Merge this season's continuing shows that carry a broadcast slot.
  try {
    for (let page = 1; page <= 3; page++) {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        sfw: "true",
      });
      const res = await jikanFetch<JikanSearchResponse>(
        `/seasons/now?${params.toString()}`,
        { revalidate: SIX_HOURS_SECONDS },
      );
      add(res.data.filter((a) => a.broadcast?.day && a.broadcast?.time));
      if (!res.pagination.has_next_page) break;
    }
  } catch {
    /* best-effort merge — the schedule grid alone is still useful */
  }

  return all;
}

/**
 * Top anime movies (`/top/anime?type=movie`). Cached 24h. Powers the Movies tab.
 */
export function getTopMovies(limit = 24): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({ type: "movie", limit: String(limit) });
  return jikanFetch<JikanSearchResponse>(`/top/anime?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/** A related anime, flattened from Jikan's relation groups. */
export type RelatedAnime = {
  relation: string;
  malId: number;
  title: string;
};

export type AnimeExtras = {
  trailerEmbedUrl: string | null;
  genres: string[];
  /** Weekly JST broadcast slot, when the title is airing. */
  broadcastDay: string | null;
  broadcastTime: string | null;
  /** Prequels/sequels/side stories — the "season list". Anime entries only. */
  related: RelatedAnime[];
  /** Alternative titles / fan nicknames ("AoT", "SnK", …). */
  synonyms: string[];
  /** OP/ED credits as MAL display strings. */
  openings: string[];
  endings: string[];
  /** Fresh catalog fields, for keeping the local `anime` row up to date. */
  synopsis: string | null;
  totalEpisodes: number | null;
  /** Raw Jikan status string, e.g. "Currently Airing". */
  airingStatus: string;
  score: number | null;
};

/** Relation kinds shown in the "Seasons & related" list, in display order. */
const RELATION_KINDS = [
  "Prequel",
  "Sequel",
  "Parent Story",
  "Side Story",
  "Spin-Off",
  "Alternative Version",
] as const;

/**
 * Detail-page extras the catalog doesn't store — trailer embed URL, genre
 * names (used to lazily backfill `anime.genres`), the broadcast slot for the
 * next-episode countdown, and related seasons. One `/anime/{id}/full` call,
 * cached 24h.
 *
 * Jikan often leaves `trailer.youtube_id` null while populating `embed_url`,
 * so prefer the latter; its `autoplay=1` is stripped so the page never
 * auto-plays audio.
 */
export async function getAnimeExtras(malId: number): Promise<AnimeExtras> {
  // 1h (not 24h): synopsis/episode-count/status changes for airing shows
  // should reach detail pages the same day MAL updates them.
  const res = await jikanFetch<JikanByIdResponse>(`/anime/${malId}/full`, {
    revalidate: 3600,
  });
  const anime = res.data;
  const trailer = anime.trailer;

  let trailerEmbedUrl: string | null = null;
  if (trailer?.embed_url) {
    try {
      const url = new URL(trailer.embed_url);
      url.searchParams.delete("autoplay");
      trailerEmbedUrl = url.toString();
    } catch {
      trailerEmbedUrl = trailer.embed_url;
    }
  } else if (trailer?.youtube_id) {
    trailerEmbedUrl = `https://www.youtube-nocookie.com/embed/${trailer.youtube_id}`;
  }

  const related: RelatedAnime[] = RELATION_KINDS.flatMap((kind) =>
    (anime.relations ?? [])
      .filter((g) => g.relation === kind)
      .flatMap((g) =>
        g.entry
          .filter((e) => e.type === "anime")
          .map((e) => ({ relation: kind, malId: e.mal_id, title: e.name })),
      ),
  );

  return {
    trailerEmbedUrl,
    genres: (anime.genres ?? []).map((g) => g.name),
    broadcastDay: anime.broadcast?.day ?? null,
    broadcastTime: anime.broadcast?.time ?? null,
    related,
    synonyms: anime.title_synonyms ?? [],
    openings: anime.theme?.openings ?? [],
    endings: anime.theme?.endings ?? [],
    synopsis: anime.synopsis,
    totalEpisodes: anime.episodes,
    airingStatus: anime.status,
    score: anime.score,
  };
}

/** A community "users also liked" recommendation for an anime. */
export type SimilarAnime = {
  malId: number;
  title: string;
  posterUrl: string | null;
};

interface JikanRecsResponse {
  data: { entry: { mal_id: number; title: string; images: JikanImages } }[];
}

/**
 * Top community recommendations for an anime (`/anime/{id}/recommendations`,
 * already ranked by votes). Cached 24h.
 */
export async function getAnimeRecommendations(
  malId: number,
  limit = 3,
): Promise<SimilarAnime[]> {
  const res = await jikanFetch<JikanRecsResponse>(
    `/anime/${malId}/recommendations`,
    { revalidate: ONE_DAY_SECONDS },
  );
  const seen = new Set<number>();
  const out: SimilarAnime[] = [];
  for (const { entry } of res.data) {
    if (seen.has(entry.mal_id)) continue;
    seen.add(entry.mal_id);
    out.push({
      malId: entry.mal_id,
      title: entry.title,
      posterUrl:
        entry.images?.jpg?.large_image_url ??
        entry.images?.jpg?.image_url ??
        null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fetch a single anime by its MyAnimeList id, using the `/full` endpoint
 * (includes relations, themes, external links, etc.).
 *
 * @param malId MyAnimeList id.
 * @returns The anime record (unwrapped from the `data` envelope).
 * @throws {JikanError} On any non-2xx response (e.g. 404 for an unknown id).
 */
export function getAnimeById(malId: number): Promise<JikanAnime> {
  return jikanFetch<JikanByIdResponse>(`/anime/${malId}/full`, {
    revalidate: ONE_HOUR_SECONDS,
  }).then((r) => r.data);
}

/**
 * A random SFW anime (`/random/anime`). Deliberately uncached — every call
 * should roll a fresh pick. Powers the recommendations "Surprise me" button.
 *
 * @throws {JikanError} On any non-2xx response.
 */
export function getRandomAnime(): Promise<JikanAnime> {
  return jikanFetch<JikanByIdResponse>("/random/anime?sfw=true").then(
    (r) => r.data,
  );
}

/**
 * One page of an anime's episode list (`/anime/{id}/episodes`, 100 per page).
 *
 * @throws {JikanError} On any non-2xx response.
 */
export function getAnimeEpisodes(
  malId: number,
  page = 1,
): Promise<JikanEpisodesResponse> {
  return jikanFetch<JikanEpisodesResponse>(
    `/anime/${malId}/episodes?page=${page}`,
    { revalidate: THIRTY_MIN_SECONDS },
  );
}

/**
 * Every episode of an anime, paging through `/anime/{id}/episodes` until done.
 * Capped at `maxPages` (100 episodes/page) so a 1000+ episode series can't fire
 * an unbounded number of requests.
 */
export async function getAllAnimeEpisodes(
  malId: number,
  maxPages = 10,
): Promise<JikanEpisode[]> {
  const all: JikanEpisode[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, pagination } = await getAnimeEpisodes(malId, page);
    all.push(...data);
    if (!pagination.has_next_page) break;
  }
  return all;
}

/* -------------------------------------------------------------------------- */
/* Manga (the /manga endpoints — powers the separate manga framework)          */
/* -------------------------------------------------------------------------- */

/** Serialization window for a manga, e.g. `{ from: "1997-07-22T…", to: null }`. */
export interface JikanPublished {
  from: string | null;
  to: string | null;
}

export interface JikanManga {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_synonyms?: string[];
  synopsis: string | null;
  /** "Manga", "Light Novel", "One-shot", etc. */
  type?: string | null;
  chapters: number | null;
  volumes: number | null;
  /** "Finished", "Publishing", "On Hiatus", "Discontinued". */
  status: string;
  score: number | null;
  scored_by?: number | null;
  members?: number | null;
  images: JikanImages;
  genres: JikanNamedEntity[];
  /** Mangaka / writers, as named entities. */
  authors?: JikanNamedEntity[];
  published?: JikanPublished;
  relations?: JikanRelationGroup[];
}

export interface JikanMangaSearchResponse {
  data: JikanManga[];
  pagination: JikanPagination;
}

interface JikanMangaByIdResponse {
  data: JikanManga;
}

/** Jikan `/manga` type filter values (the format tabs). */
export type JikanMangaType = "manga" | "manhwa" | "manhua" | "lightnovel";

/**
 * Search manga by title and/or MAL genre ids (`/manga`, SFW only). With an empty
 * query it browses by member count so the best-known titles surface first —
 * same pattern as {@link searchAnime}. `type` narrows to a media kind
 * (manga / manhwa / manhua / lightnovel). Cached 1h.
 *
 * @throws {JikanError} On any non-2xx response.
 */
export function searchManga(
  query: string,
  page = 1,
  genreIds: number[] = [],
  type?: JikanMangaType,
): Promise<JikanMangaSearchResponse> {
  const params = new URLSearchParams({ sfw: "true", page: String(page) });
  if (query) params.set("q", query);
  if (genreIds.length > 0) params.set("genres", genreIds.join(","));
  if (type) params.set("type", type);
  if (!query) {
    params.set("order_by", "members");
    params.set("sort", "desc");
  }
  return jikanFetch<JikanMangaSearchResponse>(`/manga?${params.toString()}`, {
    revalidate: ONE_HOUR_SECONDS,
  });
}

/**
 * Search the adult manga catalog (MAL genre 12 "Hentai", SFW filtering off) —
 * powers the manga side's miscellaneous section. Optional `type` narrows to
 * manga / manhwa / manhua; with no query it browses by member count.
 *
 * @throws {JikanError} On any non-2xx response.
 */
export function searchAdultManga(
  query: string,
  page = 1,
  type?: JikanMangaType,
): Promise<JikanMangaSearchResponse> {
  const params = new URLSearchParams({
    sfw: "false",
    page: String(page),
    genres: String(MAL_GENRE_HENTAI),
  });
  if (query) params.set("q", query);
  if (type) params.set("type", type);
  if (!query) {
    params.set("order_by", "members");
    params.set("sort", "desc");
  }
  return jikanFetch<JikanMangaSearchResponse>(`/manga?${params.toString()}`, {
    revalidate: ONE_HOUR_SECONDS,
  });
}

/** Top / most-popular manga (`/top/manga`, MAL rank order). Cached 24h. */
export function getTopManga(limit = 24): Promise<JikanMangaSearchResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return jikanFetch<JikanMangaSearchResponse>(`/top/manga?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/** Most-popular manga by MAL member count. Cached 24h. */
export function getTopMangaByPopularity(
  limit = 18,
): Promise<JikanMangaSearchResponse> {
  const params = new URLSearchParams({
    filter: "bypopularity",
    limit: String(limit),
  });
  return jikanFetch<JikanMangaSearchResponse>(`/top/manga?${params.toString()}`, {
    revalidate: ONE_DAY_SECONDS,
  });
}

/**
 * Fetch a single manga by its MyAnimeList id (`/manga/{id}/full`). Cached 1h.
 *
 * @throws {JikanError} On any non-2xx response (e.g. 404 for an unknown id).
 */
export function getMangaById(malId: number): Promise<JikanManga> {
  return jikanFetch<JikanMangaByIdResponse>(`/manga/${malId}/full`, {
    revalidate: ONE_HOUR_SECONDS,
  }).then((r) => r.data);
}
