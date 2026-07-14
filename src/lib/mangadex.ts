/**
 * Client for the MangaDex API (https://api.mangadex.org) — three jobs for the
 * manga framework:
 *
 *  1. Chapter lists (neither MAL nor AniList exposes per-chapter data).
 *  2. Third search engine after MAL and AniList — including titles that exist
 *     on neither (no `links.mal`), which are cataloged by `mangadex_id` and
 *     opened at /manga/md/[mangadexId].
 *  3. Detail-page data source of last resort for MAL-keyed titles.
 *
 * Rate limits: MangaDex allows ~5 req/s; calls funnel through the same
 * serial-queue pattern as the Jikan/AniList clients (~300ms spacing). The API
 * requires a descriptive User-Agent.
 */

import type { JikanManga, JikanMangaType } from "@/lib/jikan";

const MANGADEX_URL = "https://api.mangadex.org";
const COVERS_URL = "https://uploads.mangadex.org/covers";
const MIN_REQUEST_INTERVAL_MS = 300;
const USER_AGENT = "anime-maniacs/1.0 (personal tracker)";

export class MangaDexError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MangaDexError";
  }
}

/* ---------------------------- Rate limiting ------------------------------- */

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

async function mdFetch<T>(path: string): Promise<T> {
  return rateLimited(async () => {
    const res = await fetch(`${MANGADEX_URL}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // Chapter lists change often for publishing titles; 1h in the Data
      // Cache keeps repeat syncs cheap without going stale for long.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new MangaDexError(
        res.status,
        `MangaDex request failed (${res.status}): ${res.statusText}`,
      );
    }
    return (await res.json()) as T;
  });
}

/* ----------------------- Manga records → Jikan shape ----------------------- */

interface MdMangaRecord {
  id: string;
  attributes: {
    title: Record<string, string> | null;
    altTitles?: Record<string, string>[];
    description?: Record<string, string> | null;
    links: Record<string, string> | null;
    originalLanguage?: string | null;
    /** ongoing | completed | hiatus | cancelled */
    status?: string | null;
    year?: number | null;
    lastChapter?: string | null;
    contentRating?: string | null;
    tags?: { attributes: { name: Record<string, string>; group: string } }[];
  };
  relationships?: {
    type: string;
    attributes?: { fileName?: string; name?: string };
  }[];
}

interface MdMangaSearch {
  data: MdMangaRecord[];
  total?: number;
}

const MD_STATUS: Record<string, string> = {
  ongoing: "Publishing",
  completed: "Finished",
  hiatus: "On Hiatus",
  cancelled: "Discontinued",
};

/** originalLanguage → the display media kind the format tabs use. */
function mdTypeOf(lang: string | null | undefined): string {
  if (lang === "ko") return "Manhwa";
  if (lang === "zh" || lang === "zh-hk") return "Manhua";
  return "Manga";
}

/** Format-tab value → MangaDex originalLanguage filter. */
const MD_TYPE_TO_LANG: Partial<Record<JikanMangaType, string>> = {
  manga: "ja",
  manhwa: "ko",
  manhua: "zh",
};

/** Maps a MangaDex record onto the JikanManga shape the manga UIs render. */
function toJikanMangaShape(m: MdMangaRecord): JikanManga {
  const a = m.attributes;
  const title =
    a.title?.en ?? Object.values(a.title ?? {})[0] ?? `MangaDex ${m.id}`;
  const english =
    a.title?.en ??
    a.altTitles?.map((t) => t.en).find((t): t is string => Boolean(t)) ??
    null;
  const coverFile = m.relationships?.find((r) => r.type === "cover_art")
    ?.attributes?.fileName;
  const cover = coverFile ? `${COVERS_URL}/${m.id}/${coverFile}.512.jpg` : null;
  const imageSet = { image_url: cover, small_image_url: cover, large_image_url: cover };
  const malRaw = a.links?.mal;
  const malId = malRaw != null ? Number.parseInt(malRaw, 10) : NaN;
  const lastCh = Number.parseFloat(a.lastChapter ?? "");
  const authors = (m.relationships ?? [])
    .filter((r) => r.type === "author" && r.attributes?.name)
    .map((r) => ({ mal_id: 0, type: "people", name: r.attributes!.name!, url: "" }));

  return {
    mal_id: Number.isFinite(malId) && malId > 0 ? malId : null,
    mangadex_id: m.id,
    title,
    title_english: english !== title ? english : null,
    synopsis: a.description?.en?.trim() || null,
    type: mdTypeOf(a.originalLanguage),
    chapters: Number.isFinite(lastCh) ? Math.floor(lastCh) : null,
    volumes: null,
    status: a.status ? (MD_STATUS[a.status] ?? a.status) : "Unknown",
    score: null,
    images: { jpg: imageSet, webp: imageSet },
    genres: (a.tags ?? [])
      .filter((t) => t.attributes.group === "genre" || t.attributes.group === "theme")
      .map((t) => ({
        mal_id: 0,
        type: "genre",
        name: t.attributes.name.en ?? Object.values(t.attributes.name)[0] ?? "",
        url: "",
      }))
      .filter((g) => g.name),
    authors,
    published: {
      from: a.year != null ? `${a.year}-01-01T00:00:00Z` : null,
      to: null,
    },
  };
}

/**
 * SFW manga search against MangaDex — the third engine after MAL and AniList,
 * and the only one that surfaces titles with no MAL entry. `type` maps to
 * `originalLanguage` (ja / ko / zh); with no query it browses by follower
 * count. Adult ratings are excluded (the misc tab has its own chain).
 */
export async function searchMangaDexManga(
  query: string,
  page = 1,
  type?: JikanMangaType,
): Promise<{ results: JikanManga[]; totalPages: number }> {
  const limit = 40;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
  });
  if (query.trim()) {
    params.set("title", query.trim().slice(0, 100));
    params.set("order[relevance]", "desc");
  } else {
    params.set("order[followedCount]", "desc");
  }
  const lang = type ? MD_TYPE_TO_LANG[type] : undefined;
  if (lang) params.append("originalLanguage[]", lang);
  params.append("includes[]", "cover_art");
  params.append("contentRating[]", "safe");
  params.append("contentRating[]", "suggestive");

  const res = await mdFetch<MdMangaSearch>(`/manga?${params.toString()}`);
  return {
    results: res.data.map(toJikanMangaShape),
    totalPages: Math.max(1, Math.ceil((res.total ?? res.data.length) / limit)),
  };
}

/**
 * A single MangaDex manga by uuid, in the Jikan shape — powers the
 * /manga/md/[mangadexId] detail page and the MAL-keyed detail page's
 * last-resort data tier.
 */
export async function getMangaDexMangaDetail(
  mangadexId: string,
): Promise<JikanManga | null> {
  const params = new URLSearchParams();
  params.append("includes[]", "cover_art");
  params.append("includes[]", "author");
  const res = await mdFetch<{ data: MdMangaRecord | null }>(
    `/manga/${mangadexId}?${params.toString()}`,
  );
  return res.data ? toJikanMangaShape(res.data) : null;
}

/* ------------------------------- Resolution ------------------------------- */

/**
 * Resolves a MangaDex uuid for a MAL manga id by title search, accepting only
 * a result whose `links.mal` matches — a strict match, so we never attach the
 * wrong chapter list. Tries the romaji title, then the English one. Returns
 * null when MangaDex has no linked entry.
 */
export async function resolveMangaDexId(
  malId: number,
  titles: (string | null)[],
): Promise<string | null> {
  const malStr = String(malId);
  for (const title of titles) {
    const t = title?.trim();
    if (!t) continue;
    const res = await mdFetch<MdMangaSearch>(
      `/manga?title=${encodeURIComponent(t.slice(0, 100))}&limit=10`,
    );
    const hit = res.data.find((m) => m.attributes.links?.mal === malStr);
    if (hit) return hit.id;
  }
  return null;
}

/* -------------------------------- Chapters -------------------------------- */

export type MangaDexChapter = {
  /** Chapter number ("10.5" supported). */
  number: number;
  title: string | null;
  /** ISO date (YYYY-MM-DD) the chapter went up, when known. */
  publishedAt: string | null;
};

interface MdFeed {
  data: {
    attributes: {
      chapter: string | null;
      title: string | null;
      publishAt: string | null;
      translatedLanguage: string | null;
    };
  }[];
  total: number;
}

/** Feed page size (MangaDex max is 500). */
const FEED_LIMIT = 500;
/** Cap the English title feed at 4 pages × 500 entries. */
const MAX_FEED_PAGES = 4;

/**
 * `/manga/{id}/aggregate` — every chapter number MangaDex knows, across ALL
 * languages, in one cheap call. `volumes` is a keyed object (or `[]` when the
 * manga has none).
 */
interface MdAggregate {
  volumes:
    | Record<string, { chapters: Record<string, { chapter: string }> }>
    | unknown[];
}

/**
 * The full chapter list for a MangaDex manga, ordered ascending:
 *
 *  1. **Numbers** come from the `/aggregate` endpoint (all languages), which
 *     is complete — an English-only feed misses every not-yet-translated
 *     chapter, which is how lists ended up short of the latest release.
 *  2. **Titles + dates** are layered on from the English feed (deduped per
 *     number; the first titled version wins, all content ratings included so
 *     the miscellaneous section's titles resolve too).
 */
export async function getMangaDexChapters(
  mangadexId: string,
): Promise<MangaDexChapter[]> {
  const byNumber = new Map<number, MangaDexChapter>();

  // 1) Complete number backbone from the all-language aggregate.
  try {
    const agg = await mdFetch<MdAggregate>(`/manga/${mangadexId}/aggregate`);
    const volumes = Array.isArray(agg.volumes) ? [] : Object.values(agg.volumes);
    for (const vol of volumes) {
      for (const ch of Object.values(vol.chapters ?? {})) {
        const num = Number.parseFloat(ch.chapter ?? "");
        if (!Number.isFinite(num) || byNumber.has(num)) continue;
        byNumber.set(num, { number: num, title: null, publishedAt: null });
      }
    }
  } catch {
    /* aggregate down — the feed below still provides a usable list */
  }

  // 2) English titles + publish dates layered onto the numbers.
  for (let page = 0; page < MAX_FEED_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(FEED_LIMIT),
      offset: String(page * FEED_LIMIT),
      "order[chapter]": "asc",
    });
    params.append("translatedLanguage[]", "en");
    for (const r of ["safe", "suggestive", "erotica", "pornographic"]) {
      params.append("contentRating[]", r);
    }

    const res = await mdFetch<MdFeed>(
      `/manga/${mangadexId}/feed?${params.toString()}`,
    );

    for (const c of res.data) {
      const num = Number.parseFloat(c.attributes.chapter ?? "");
      if (!Number.isFinite(num)) continue; // oneshot/extra rows without numbers
      const title = c.attributes.title?.trim() || null;
      const publishedAt = c.attributes.publishAt
        ? c.attributes.publishAt.slice(0, 10)
        : null;
      const existing = byNumber.get(num);
      if (!existing) {
        byNumber.set(num, { number: num, title, publishedAt });
      } else {
        if (!existing.title && title) existing.title = title;
        if (!existing.publishedAt && publishedAt) existing.publishedAt = publishedAt;
      }
    }

    if ((page + 1) * FEED_LIMIT >= res.total) break;
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
