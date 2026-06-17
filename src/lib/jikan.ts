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

async function jikanFetch<T>(path: string): Promise<T> {
  return rateLimited(async () => {
    const res = await fetch(`${JIKAN_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
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
