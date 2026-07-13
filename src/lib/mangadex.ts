/**
 * Minimal client for the MangaDex API (https://api.mangadex.org) — the chapter
 * source for the manga framework. Neither MAL nor AniList exposes per-chapter
 * data; MangaDex does, and its manga records carry a `links.mal` id we can
 * match against our catalog.
 *
 * Rate limits: MangaDex allows ~5 req/s; calls funnel through the same
 * serial-queue pattern as the Jikan/AniList clients (~300ms spacing). The API
 * requires a descriptive User-Agent.
 */

const MANGADEX_URL = "https://api.mangadex.org";
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

/* ------------------------------- Resolution ------------------------------- */

interface MdMangaSearch {
  data: {
    id: string;
    attributes: {
      title: Record<string, string> | null;
      links: Record<string, string> | null;
    };
  }[];
}

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
/** Cap total chapters synced per manga (3 pages × 500). */
const MAX_FEED_PAGES = 3;

/**
 * The full English chapter list for a MangaDex manga, deduped by chapter
 * number (multiple scanlation groups upload the same chapter — the first
 * titled version wins). Ordered ascending. All content ratings included so
 * the miscellaneous section's titles resolve too.
 */
export async function getMangaDexChapters(
  mangadexId: string,
): Promise<MangaDexChapter[]> {
  const byNumber = new Map<number, MangaDexChapter>();

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
      const existing = byNumber.get(num);
      if (!existing) {
        byNumber.set(num, {
          number: num,
          title,
          publishedAt: c.attributes.publishAt
            ? c.attributes.publishAt.slice(0, 10)
            : null,
        });
      } else if (!existing.title && title) {
        existing.title = title;
      }
    }

    if ((page + 1) * FEED_LIMIT >= res.total) break;
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
