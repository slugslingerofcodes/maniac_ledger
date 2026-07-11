import { GENRE_OPTIONS } from "@/lib/genres";
import type {
  JikanAnime,
  JikanImageSet,
  JikanSearchResponse,
} from "@/lib/jikan";
import type {
  FormatValue,
  Season,
  StatusValue,
} from "@/lib/search-filters";
import { FORMAT_OPTIONS, STATUS_OPTIONS } from "@/lib/search-filters";

/**
 * Typed client for the AniList GraphQL API (https://graphql.anilist.co) — the
 * backup catalog. MAL (via Jikan) stays primary; AniList serves two jobs:
 *
 *  1. Outage fallback — when Jikan is down, search/random re-run here.
 *  2. Advanced filters — AniList can express filters MAL can't (streaming
 *     service, country of origin, source material, episode/duration ranges,
 *     tags, season browse), so those queries run here directly.
 *
 * Every result is mapped onto the `JikanAnime` shape keyed by `idMal`, so the
 * rest of the app (poster cards, add-to-library, `/anime/mal/[id]` links)
 * renders AniList data with zero changes. Entries with no MAL id are dropped —
 * they couldn't be opened or added anyway.
 *
 * Rate limits: AniList currently enforces a degraded 30 req/min budget, so
 * calls funnel through the same serial-queue pattern as the Jikan client.
 */

const ANILIST_URL = "https://graphql.anilist.co";

/** 30 req/min budget → space requests ~2.1s apart. */
const MIN_REQUEST_INTERVAL_MS = 2_100;

const ONE_HOUR_SECONDS = 3_600;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class AnilistError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AnilistError";
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting (same serial-chain pattern as jikan.ts)                      */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/* -------------------------------------------------------------------------- */
/* GraphQL plumbing                                                           */
/* -------------------------------------------------------------------------- */

async function anilistFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  opts?: { revalidate?: number },
): Promise<T> {
  return rateLimited(async () => {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      // Next's Data Cache caches POSTs too (keyed on body), so repeat
      // filter combinations are served without touching the rate budget.
      ...(opts?.revalidate != null
        ? { next: { revalidate: opts.revalidate } }
        : { cache: "no-store" as const }),
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as {
          errors?: { message?: string }[];
        };
        detail = body.errors?.[0]?.message ?? detail;
      } catch {
        /* non-JSON error body */
      }
      throw new AnilistError(
        res.status,
        `AniList request failed (${res.status}): ${detail}`,
      );
    }

    const body = (await res.json()) as { data?: T; errors?: { message?: string }[] };
    if (body.errors?.length || body.data == null) {
      throw new AnilistError(
        200,
        `AniList query error: ${body.errors?.[0]?.message ?? "no data"}`,
      );
    }
    return body.data;
  });
}

/* -------------------------------------------------------------------------- */
/* AniList → Jikan shape mapping                                              */
/* -------------------------------------------------------------------------- */

interface AnilistMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null };
  description: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  averageScore: number | null;
  popularity: number | null;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  } | null;
  genres: string[] | null;
  studios: { nodes: { name: string }[] } | null;
}

interface AnilistPage {
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
  media: AnilistMedia[];
}

const STATUS_TO_JIKAN: Record<string, string> = {
  FINISHED: "Finished Airing",
  RELEASING: "Currently Airing",
  NOT_YET_RELEASED: "Not yet aired",
  CANCELLED: "Discontinued",
  HIATUS: "On Hiatus",
};

const FORMAT_TO_JIKAN: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

/** AniList descriptions are HTML; the app renders plain text. */
function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return (
    html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim() || null
  );
}

function toJikanShape(m: AnilistMedia): JikanAnime {
  const poster =
    m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null;
  const imageSet: JikanImageSet = {
    image_url: poster,
    small_image_url: m.coverImage?.medium ?? poster,
    large_image_url: poster,
  };
  return {
    mal_id: m.idMal!,
    title: m.title.romaji ?? m.title.english ?? `AniList #${m.id}`,
    title_english: m.title.english,
    synopsis: stripHtml(m.description),
    type: m.format ? (FORMAT_TO_JIKAN[m.format] ?? m.format) : null,
    duration: m.duration != null ? `${m.duration} min per ep` : null,
    episodes: m.episodes,
    score:
      m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    scored_by: null,
    members: m.popularity,
    status: m.status ? (STATUS_TO_JIKAN[m.status] ?? m.status) : "Unknown",
    season: (m.season?.toLowerCase() as JikanAnime["season"]) ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    images: { jpg: imageSet, webp: imageSet },
    genres: (m.genres ?? []).map((name) => ({
      mal_id: 0,
      type: "genre",
      name,
      url: "",
    })),
    studios: (m.studios?.nodes ?? []).map((s) => ({
      mal_id: 0,
      type: "studio",
      name: s.name,
      url: "",
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* MAL genre ids → AniList genres/tags                                        */
/* -------------------------------------------------------------------------- */

/**
 * AniList's genre list is small and fixed; anything else in our curated MAL
 * set (themes, demographics) exists on AniList as a *tag* instead. Names match
 * MAL's except Suspense → Thriller.
 */
const ANILIST_GENRE_NAMES = new Set([
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
]);

const MAL_TO_ANILIST_NAME: Record<string, string> = {
  Suspense: "Thriller",
};

export function malGenresToAnilist(genreIds: number[]): {
  genres: string[];
  tags: string[];
} {
  const genres: string[] = [];
  const tags: string[] = [];
  for (const id of genreIds) {
    const opt = GENRE_OPTIONS.find((g) => g.id === id);
    if (!opt) continue;
    const name = MAL_TO_ANILIST_NAME[opt.name] ?? opt.name;
    (ANILIST_GENRE_NAMES.has(name) ? genres : tags).push(name);
  }
  return { genres, tags };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type AnilistSearchFilters = {
  query?: string;
  /** MAL genre ids — translated to AniList genre/tag names. */
  genreIds?: number[];
  /** AniList tag names (from the curated TAG_OPTIONS list). */
  tags?: string[];
  season?: Season;
  year?: number;
  format?: FormatValue;
  status?: StatusValue;
  /** AniList `licensedBy_in` site name, e.g. "Crunchyroll". */
  streaming?: string;
  /** ISO country code: JP / KR / CN / TW. */
  country?: string;
  /** AniList MediaSource, e.g. "MANGA". */
  source?: string;
  minYear?: number;
  maxYear?: number;
  minEpisodes?: number;
  maxEpisodes?: number;
  minDuration?: number;
  maxDuration?: number;
  /** true → doujin (self-published) works only. */
  doujin?: boolean;
};

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english }
  description
  format
  status
  episodes
  duration
  averageScore
  popularity
  season
  seasonYear
  startDate { year }
  coverImage { extraLarge large medium }
  genres
  studios(isMain: true) { nodes { name } }
`;

/** One app page = one AniList page of 50 (matches the ≤50/page app contract). */
const PER_PAGE = 50;

/**
 * Filtered anime search against AniList, returned in the Jikan response shape.
 * Entries without a MAL id are dropped so detail links and add-to-library keep
 * working. SFW only (`isAdult: false`).
 */
export async function searchAnilist(
  filters: AnilistSearchFilters,
  page = 1,
): Promise<JikanSearchResponse> {
  const { genres: genreNames, tags: genreTags } = malGenresToAnilist(
    filters.genreIds ?? [],
  );
  const tags = [...new Set([...genreTags, ...(filters.tags ?? [])])];

  const format = filters.format
    ? FORMAT_OPTIONS.find((f) => f.value === filters.format)?.anilist
    : undefined;
  const status = filters.status
    ? STATUS_OPTIONS.find((s) => s.value === filters.status)?.anilist
    : undefined;

  // Exact year beats the range slider; both map to a FuzzyDateInt window.
  const fromYear = filters.year ?? filters.minYear;
  const toYear = filters.year ?? filters.maxYear;

  // Declare only the variables we actually pass — AniList treats an explicit
  // null filter differently from an omitted one.
  const vars: Record<string, unknown> = { page: page, perPage: PER_PAGE };
  const defs: string[] = ["$page: Int", "$perPage: Int"];
  const args: string[] = [
    "type: ANIME",
    "isAdult: false",
    filters.query ? "sort: SEARCH_MATCH" : "sort: POPULARITY_DESC",
  ];
  const add = (name: string, gqlType: string, argName: string, value: unknown) => {
    if (value === undefined || value === null) return;
    vars[name] = value;
    defs.push(`$${name}: ${gqlType}`);
    args.push(`${argName}: $${name}`);
  };

  add("search", "String", "search", filters.query || undefined);
  add("genres", "[String]", "genre_in", genreNames.length ? genreNames : undefined);
  add("tags", "[String]", "tag_in", tags.length ? tags : undefined);
  add("season", "MediaSeason", "season", filters.season?.toUpperCase());
  add("format", "[MediaFormat]", "format_in", format ? [format] : undefined);
  add("status", "MediaStatus", "status", status);
  add(
    "licensedBy",
    "[String]",
    "licensedBy_in",
    filters.streaming ? [filters.streaming] : undefined,
  );
  add("country", "CountryCode", "countryOfOrigin", filters.country);
  add("source", "[MediaSource]", "source_in", filters.source ? [filters.source] : undefined);
  // start-date window: strictly-greater/lesser FuzzyDateInts bracketing the years.
  add(
    "startGreater",
    "FuzzyDateInt",
    "startDate_greater",
    fromYear != null ? fromYear * 10_000 : undefined,
  );
  add(
    "startLesser",
    "FuzzyDateInt",
    "startDate_lesser",
    toYear != null ? (toYear + 1) * 10_000 : undefined,
  );
  // episodes/duration comparators are strict, so widen by 1 to make them inclusive.
  add(
    "epGreater",
    "Int",
    "episodes_greater",
    filters.minEpisodes != null && filters.minEpisodes > 0
      ? filters.minEpisodes - 1
      : undefined,
  );
  add("epLesser", "Int", "episodes_lesser", filters.maxEpisodes != null ? filters.maxEpisodes + 1 : undefined);
  add(
    "durGreater",
    "Int",
    "duration_greater",
    filters.minDuration != null && filters.minDuration > 0
      ? filters.minDuration - 1
      : undefined,
  );
  add("durLesser", "Int", "duration_lesser", filters.maxDuration != null ? filters.maxDuration + 1 : undefined);
  add("isLicensed", "Boolean", "isLicensed", filters.doujin ? false : undefined);

  const query = `
    query (${defs.join(", ")}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(${args.join(", ")}) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistFetch<{ Page: AnilistPage }>(query, vars, {
    revalidate: ONE_HOUR_SECONDS,
  });
  const { pageInfo, media } = data.Page;

  const seen = new Set<number>();
  const results = media
    .filter((m) => {
      if (m.idMal == null || seen.has(m.idMal)) return false;
      seen.add(m.idMal);
      return true;
    })
    .map(toJikanShape);

  return {
    data: results,
    pagination: {
      last_visible_page: Math.max(1, pageInfo.lastPage),
      has_next_page: pageInfo.hasNextPage,
      current_page: pageInfo.currentPage,
      items: {
        count: results.length,
        total: pageInfo.total,
        per_page: pageInfo.perPage,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Random                                                                     */
/* -------------------------------------------------------------------------- */

/** How deep into the popularity ranking the random roll samples. */
const RANDOM_POOL_PAGES = 100;
const RANDOM_PER_PAGE = 20;

/**
 * A random anime from AniList's top ~2000 by popularity (uncached — every call
 * is a fresh roll). Used when MAL's `/random/anime` is unreachable.
 *
 * @throws {AnilistError} when the page fetch fails or has no MAL-linked entry.
 */
export async function randomAnilistAnime(): Promise<JikanAnime> {
  const page = 1 + Math.floor(Math.random() * RANDOM_POOL_PAGES);
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const data = await anilistFetch<{ Page: AnilistPage }>(query, {
    page,
    perPage: RANDOM_PER_PAGE,
  });
  const candidates = data.Page.media.filter((m) => m.idMal != null);
  if (candidates.length === 0) {
    throw new AnilistError(200, "AniList random page had no MAL-linked entries");
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
  return toJikanShape(pick);
}
