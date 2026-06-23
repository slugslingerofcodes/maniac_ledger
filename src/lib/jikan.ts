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

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  synopsis: string | null;
  episodes: number | null;
  score: number | null;
  scored_by: number | null;
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

async function jikanFetch<T>(
  path: string,
  // Opt into Next's Data Cache for endpoints that change slowly (e.g. the
  // upcoming season). Omitted → default fetch behavior.
  opts?: { revalidate?: number },
): Promise<T> {
  return rateLimited(async () => {
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
        const body = (await res.json()) as { message?: string; error?: string };
        detail = body.message ?? body.error ?? detail;
      } catch {
        /* non-JSON error body — keep statusText */
      }
      throw new JikanError(
        res.status,
        `Jikan request failed (${res.status}): ${detail}`,
      );
    }

    return (await res.json()) as T;
  });
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Search anime by title. SFW results only.
 *
 * @param query Free-text title query (e.g. "Frieren").
 * @param page  1-based page number (Jikan returns 25 results/page).
 * @returns The matching anime plus pagination metadata.
 * @throws {JikanError} On any non-2xx response (e.g. 429 when rate limited).
 */
export function searchAnime(
  query: string,
  page = 1,
): Promise<JikanSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    sfw: "true",
    page: String(page),
  });
  return jikanFetch<JikanSearchResponse>(`/anime?${params.toString()}`);
}

/** ~3 req/sec → space requests ~350ms apart; one day in seconds for caching. */
const ONE_DAY_SECONDS = 86_400;

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
 * Fetch a single anime by its MyAnimeList id, using the `/full` endpoint
 * (includes relations, themes, external links, etc.).
 *
 * @param malId MyAnimeList id.
 * @returns The anime record (unwrapped from the `data` envelope).
 * @throws {JikanError} On any non-2xx response (e.g. 404 for an unknown id).
 */
export function getAnimeById(malId: number): Promise<JikanAnime> {
  return jikanFetch<JikanByIdResponse>(`/anime/${malId}/full`).then(
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
