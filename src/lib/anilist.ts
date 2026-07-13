import { GENRE_OPTIONS } from "@/lib/genres";
import { JST_DAYS, JST_OFFSET_MS } from "@/lib/jst";
import type {
  JikanAnime,
  JikanImageSet,
  JikanManga,
  JikanMangaSearchResponse,
  JikanMangaType,
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
const ONE_DAY_SECONDS = 86_400;

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
/* Single-title details (for the anime info grid)                             */
/* -------------------------------------------------------------------------- */

/**
 * Extra catalog facts AniList has that our catalog row + Jikan don't expose
 * cleanly: the source author, country of origin, official site, adult flag,
 * per-episode duration, and precise start/end dates.
 */
export type AnimeExtraInfo = {
  /** Source-material author (AniList "Original Creator" / "Story" staff). */
  author: string | null;
  /** ISO country code of origin, e.g. "JP" / "KR" / "CN". */
  countryOfOrigin: string | null;
  /** Official website URL, when AniList lists one. */
  officialSite: string | null;
  /** True when AniList flags the title 18+. */
  isAdult: boolean | null;
  /** Runtime per episode, in minutes. */
  durationMinutes: number | null;
  /** AniList average score on a 100-point scale. */
  averageScore: number | null;
  /** Main studios. */
  studios: string[];
  /** ISO-ish dates as { year, month, day }; any field may be null. */
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  endDate: { year: number | null; month: number | null; day: number | null } | null;
};

interface AnilistMediaDetails {
  Media: {
    format: string | null;
    duration: number | null;
    averageScore: number | null;
    countryOfOrigin: string | null;
    isAdult: boolean | null;
    startDate: { year: number | null; month: number | null; day: number | null } | null;
    endDate: { year: number | null; month: number | null; day: number | null } | null;
    studios: { nodes: { name: string }[] } | null;
    externalLinks: { site: string | null; url: string | null; type: string | null }[] | null;
    staff: {
      edges: { role: string | null; node: { name: { full: string | null } | null } }[];
    } | null;
  } | null;
}

/** Staff roles (in priority order) that identify the source author. */
const AUTHOR_ROLES = ["Original Creator", "Original Story", "Story", "Creator"];

/**
 * Rich single-title details by MAL id, for the anime info grid. Best-effort:
 * returns null when AniList has no match or is unreachable, so the detail page
 * degrades to the catalog row + Jikan extras it already has. Cached 24h.
 */
export async function getAnimeExtraInfo(
  malId: number,
): Promise<AnimeExtraInfo | null> {
  const query = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        format
        duration
        averageScore
        countryOfOrigin
        isAdult
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) { nodes { name } }
        externalLinks { site url type }
        staff(sort: RELEVANCE, perPage: 8) {
          edges { role node { name { full } } }
        }
      }
    }
  `;

  let data: AnilistMediaDetails;
  try {
    data = await anilistFetch<AnilistMediaDetails>(
      query,
      { idMal: malId },
      { revalidate: ONE_DAY_SECONDS },
    );
  } catch {
    return null;
  }
  const m = data.Media;
  if (!m) return null;

  // Author: the highest-priority matching staff role, else the first credit.
  const edges = m.staff?.edges ?? [];
  let author: string | null = null;
  for (const role of AUTHOR_ROLES) {
    const hit = edges.find((e) =>
      (e.role ?? "").toLowerCase().includes(role.toLowerCase()),
    );
    if (hit?.node?.name?.full) {
      author = hit.node.name.full;
      break;
    }
  }

  // Official site: the link literally named "Official Site", else any INFO link.
  const links = m.externalLinks ?? [];
  const officialSite =
    links.find((l) => (l.site ?? "").toLowerCase() === "official site")?.url ??
    links.find((l) => (l.type ?? "").toUpperCase() === "INFO")?.url ??
    null;

  return {
    author,
    countryOfOrigin: m.countryOfOrigin,
    officialSite,
    isAdult: m.isAdult,
    durationMinutes: m.duration,
    averageScore: m.averageScore,
    studios: (m.studios?.nodes ?? []).map((s) => s.name),
    startDate: m.startDate,
    endDate: m.endDate,
  };
}

/* -------------------------------------------------------------------------- */
/* User list import                                                           */
/* -------------------------------------------------------------------------- */

/** One entry of a user's AniList anime list, ready to import. */
export type AnilistListEntry = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  totalEpisodes: number | null;
  format: string | null;
  /** AniList list status, e.g. "CURRENT" | "COMPLETED" | "PLANNING" | … */
  status: string;
  /** Episodes the user has watched. */
  progress: number;
  /** User's score on a 10-point scale (0 = unrated). */
  score: number;
  averageScore: number | null;
};

interface AnilistListCollection {
  MediaListCollection: {
    lists: {
      entries: {
        status: string;
        progress: number | null;
        score: number | null;
        media: {
          idMal: number | null;
          title: { romaji: string | null; english: string | null };
          episodes: number | null;
          format: string | null;
          averageScore: number | null;
          coverImage: { extraLarge: string | null; large: string | null } | null;
        };
      }[];
    }[];
    hasNextChunk: boolean;
  };
}

/**
 * A user's full public anime list by AniList username. Paged in chunks of 500;
 * entries without a MAL id are dropped (they can't join our catalog).
 *
 * @throws {AnilistError} 404-shaped errors when the username doesn't exist.
 */
export async function getAnilistUserList(
  username: string,
): Promise<AnilistListEntry[]> {
  const query = `
    query ($userName: String, $chunk: Int) {
      MediaListCollection(
        userName: $userName
        type: ANIME
        chunk: $chunk
        perChunk: 500
        forceSingleCompletedList: true
      ) {
        hasNextChunk
        lists {
          entries {
            status
            progress
            score(format: POINT_10)
            media {
              idMal
              title { romaji english }
              episodes
              format
              averageScore
              coverImage { extraLarge large }
            }
          }
        }
      }
    }
  `;

  const out: AnilistListEntry[] = [];
  for (let chunk = 1; chunk <= 6; chunk++) {
    const data = await anilistFetch<AnilistListCollection>(query, {
      userName: username,
      chunk,
    });
    for (const list of data.MediaListCollection.lists) {
      for (const e of list.entries) {
        if (e.media.idMal == null) continue;
        out.push({
          malId: e.media.idMal,
          title: e.media.title.romaji ?? e.media.title.english ?? `MAL ${e.media.idMal}`,
          titleEnglish: e.media.title.english,
          posterUrl:
            e.media.coverImage?.extraLarge ?? e.media.coverImage?.large ?? null,
          totalEpisodes: e.media.episodes,
          format: e.media.format,
          status: e.status,
          progress: e.progress ?? 0,
          score: e.score ?? 0,
          averageScore: e.media.averageScore,
        });
      }
    }
    if (!data.MediaListCollection.hasNextChunk) break;
  }

  // Dedupe by malId (repeating + completed can both carry an entry).
  const seen = new Set<number>();
  return out.filter((e) => (seen.has(e.malId) ? false : (seen.add(e.malId), true)));
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

/* -------------------------------------------------------------------------- */
/* Manga (outage fallback for the manga framework)                             */
/* -------------------------------------------------------------------------- */

interface AnilistMangaMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null };
  description: string | null;
  /** MANGA | NOVEL | ONE_SHOT */
  format: string | null;
  status: string | null;
  chapters: number | null;
  volumes: number | null;
  averageScore: number | null;
  popularity: number | null;
  startDate: { year: number | null } | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  } | null;
  genres: string[] | null;
  /** JP / KR / CN / TW — drives the Manga/Manhwa/Manhua display type. */
  countryOfOrigin: string | null;
  staff?: {
    edges: { role: string | null; node: { name: { full: string | null } | null } }[];
  } | null;
}

/** AniList MediaStatus → MAL's manga status strings. */
const MANGA_STATUS_TO_JIKAN: Record<string, string> = {
  FINISHED: "Finished",
  RELEASING: "Publishing",
  NOT_YET_RELEASED: "Not yet published",
  CANCELLED: "Discontinued",
  HIATUS: "On Hiatus",
};

/** Display media kind from AniList format + country of origin. */
function mangaTypeOf(m: AnilistMangaMedia): string {
  if (m.format === "NOVEL") return "Light Novel";
  if (m.format === "ONE_SHOT") return "One-shot";
  switch (m.countryOfOrigin) {
    case "KR":
      return "Manhwa";
    case "CN":
    case "TW":
      return "Manhua";
    default:
      return "Manga";
  }
}

/** Author names from the staff credits ("Story & Art", "Story", "Art", …). */
function mangaAuthorsOf(m: AnilistMangaMedia): { mal_id: number; type: string; name: string; url: string }[] {
  const names: string[] = [];
  for (const e of m.staff?.edges ?? []) {
    const role = (e.role ?? "").toLowerCase();
    const name = e.node?.name?.full;
    if (!name) continue;
    if (role.includes("story") || role.includes("art") || role.includes("creator")) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.map((name) => ({ mal_id: 0, type: "people", name, url: "" }));
}

function toJikanMangaShape(m: AnilistMangaMedia): JikanManga {
  const cover =
    m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null;
  const imageSet: JikanImageSet = {
    image_url: cover,
    small_image_url: m.coverImage?.medium ?? cover,
    large_image_url: cover,
  };
  return {
    mal_id: m.idMal!,
    title: m.title.romaji ?? m.title.english ?? `AniList #${m.id}`,
    title_english: m.title.english,
    synopsis: stripHtml(m.description),
    type: mangaTypeOf(m),
    chapters: m.chapters,
    volumes: m.volumes,
    status: m.status ? (MANGA_STATUS_TO_JIKAN[m.status] ?? m.status) : "Unknown",
    score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    scored_by: null,
    members: m.popularity,
    images: { jpg: imageSet, webp: imageSet },
    genres: (m.genres ?? []).map((name) => ({
      mal_id: 0,
      type: "genre",
      name,
      url: "",
    })),
    authors: mangaAuthorsOf(m),
    // Year only — enough for `yearOf()` when cataloging fallback rows.
    published: {
      from: m.startDate?.year != null ? `${m.startDate.year}-01-01T00:00:00Z` : null,
      to: null,
    },
  };
}

const MANGA_MEDIA_FIELDS = `
  id
  idMal
  title { romaji english }
  description
  format
  status
  chapters
  volumes
  averageScore
  popularity
  startDate { year }
  coverImage { extraLarge large medium }
  genres
  countryOfOrigin
`;

/** Format-tab value → AniList countryOfOrigin filter. */
const MANGA_TYPE_TO_COUNTRY: Record<JikanMangaType, string> = {
  manga: "JP",
  manhwa: "KR",
  manhua: "CN",
};

/**
 * Manga search against AniList, returned in the Jikan manga response shape —
 * the fallback engine when MAL is down. The format tabs map to AniList's
 * `countryOfOrigin` (JP / KR / CN); with no query it browses by popularity.
 * Entries without a MAL id are dropped (detail links are mal_id-keyed).
 *
 * @throws {AnilistError} On any failed request.
 */
export async function searchAnilistManga(
  query: string,
  page = 1,
  type?: JikanMangaType,
): Promise<JikanMangaSearchResponse> {
  const vars: Record<string, unknown> = { page, perPage: PER_PAGE };
  const defs: string[] = ["$page: Int", "$perPage: Int"];
  const args: string[] = [
    "type: MANGA",
    query.trim() ? "sort: SEARCH_MATCH" : "sort: POPULARITY_DESC",
  ];
  if (query.trim()) {
    vars.search = query.trim();
    defs.push("$search: String");
    args.push("search: $search");
  }
  if (type) {
    vars.country = MANGA_TYPE_TO_COUNTRY[type];
    defs.push("$country: CountryCode");
    args.push("countryOfOrigin: $country");
    // Every format tab means comics, not novels — without this, the Manhwa /
    // Manhua tabs would include Korean/Chinese light novels (format NOVEL).
    args.push("format_in: [MANGA, ONE_SHOT]");
  }

  const gql = `
    query (${defs.join(", ")}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(${args.join(", ")}) {
          ${MANGA_MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { pageInfo: AnilistPage["pageInfo"]; media: AnilistMangaMedia[] };
  }>(gql, vars, { revalidate: ONE_HOUR_SECONDS });
  const { pageInfo, media } = data.Page;

  const seen = new Set<number>();
  const results = media
    .filter((m) => {
      if (m.idMal == null || seen.has(m.idMal)) return false;
      seen.add(m.idMal);
      return true;
    })
    .map(toJikanMangaShape);

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

/**
 * A single manga by MAL id — the detail-page fallback when Jikan is down.
 * Includes staff credits so authors render. Returns null when AniList has no
 * matching entry (rather than throwing) so callers can fall through to the
 * local catalog. Cached 1h.
 */
export async function getAnilistMangaByMalId(
  malId: number,
): Promise<JikanManga | null> {
  const gql = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: MANGA) {
        ${MANGA_MEDIA_FIELDS}
        staff(sort: RELEVANCE, perPage: 8) {
          edges { role node { name { full } } }
        }
      }
    }
  `;
  const data = await anilistFetch<{ Media: AnilistMangaMedia | null }>(
    gql,
    { idMal: malId },
    { revalidate: ONE_HOUR_SECONDS },
  );
  if (!data.Media || data.Media.idMal == null) return null;
  return toJikanMangaShape(data.Media);
}

/* -------------------------------------------------------------------------- */
/* Adult anime (outage fallback for the miscellaneous tab)                    */
/* -------------------------------------------------------------------------- */

/** Misc-tab mode → AniList genre names. `genre_in` is OR semantics. */
const ADULT_MODE_GENRES: Record<"ecchi" | "hentai" | "both", string[]> = {
  ecchi: ["Ecchi"],
  hentai: ["Hentai"],
  both: ["Ecchi", "Hentai"],
};

/**
 * Adult (ecchi / hentai) anime search against AniList — the fallback engine
 * for /api/anime/misc-search when MAL is down. Unlike `searchAnilist` this
 * deliberately does NOT pass `isAdult: false`; the genre filter scopes the
 * catalog instead. Returned in the Jikan response shape.
 *
 * @throws {AnilistError} On any failed request.
 */
/* -------------------------------------------------------------------------- */
/* Airing schedule (outage fallback for /schedule + the home mini-schedule)   */
/* -------------------------------------------------------------------------- */

/** How many popularity-ranked pages of currently-releasing shows to fetch. */
const SCHEDULE_PAGES = 3;

/**
 * The weekly airing board from AniList — the fallback for Jikan's
 * `/schedules` grid. Fetches currently-releasing anime and derives each
 * show's JST broadcast slot from `nextAiringEpisode.airingAt` (a unix
 * timestamp), emitting Jikan-style `broadcast.day` ("Mondays") and
 * `broadcast.time` ("HH:MM") the schedule UIs already consume. Entries with
 * no MAL id or no scheduled next episode are dropped — the board can't place
 * them. Cached 1h.
 *
 * @throws {AnilistError} On any failed request.
 */
export async function getAnilistAiringSchedule(): Promise<JikanAnime[]> {
  const gql = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(type: ANIME, status: RELEASING, isAdult: false, sort: POPULARITY_DESC) {
          ${MEDIA_FIELDS}
          nextAiringEpisode { airingAt }
        }
      }
    }
  `;

  type ScheduleMedia = AnilistMedia & {
    nextAiringEpisode: { airingAt: number } | null;
  };

  const seen = new Set<number>();
  const out: JikanAnime[] = [];
  for (let page = 1; page <= SCHEDULE_PAGES; page++) {
    const data = await anilistFetch<{
      Page: { pageInfo: AnilistPage["pageInfo"]; media: ScheduleMedia[] };
    }>(gql, { page, perPage: PER_PAGE }, { revalidate: ONE_HOUR_SECONDS });

    for (const m of data.Page.media) {
      const airingAt = m.nextAiringEpisode?.airingAt;
      if (m.idMal == null || airingAt == null || seen.has(m.idMal)) continue;
      seen.add(m.idMal);

      // airingAt → JST wall clock (UTC fields of a +9h-shifted Date read as JST).
      const jst = new Date(airingAt * 1000 + JST_OFFSET_MS);
      const day = JST_DAYS[jst.getUTCDay()]!;
      const time = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(
        jst.getUTCMinutes(),
      ).padStart(2, "0")}`;

      const shaped = toJikanShape(m);
      shaped.broadcast = { day, time, timezone: "Asia/Tokyo", string: null };
      out.push(shaped);
    }

    if (!data.Page.pageInfo.hasNextPage) break;
  }
  return out;
}

export async function searchAnilistAdultAnime(
  query: string,
  page = 1,
  mode: "ecchi" | "hentai" | "both" = "both",
): Promise<JikanSearchResponse> {
  const vars: Record<string, unknown> = {
    page,
    perPage: PER_PAGE,
    genres: ADULT_MODE_GENRES[mode],
  };
  const defs = ["$page: Int", "$perPage: Int", "$genres: [String]"];
  const args = [
    "type: ANIME",
    "genre_in: $genres",
    query.trim() ? "sort: SEARCH_MATCH" : "sort: POPULARITY_DESC",
  ];
  if (query.trim()) {
    vars.search = query.trim();
    defs.push("$search: String");
    args.push("search: $search");
  }

  const gql = `
    query (${defs.join(", ")}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(${args.join(", ")}) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistFetch<{ Page: AnilistPage }>(gql, vars, {
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
