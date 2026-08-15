import { createAdminClient } from "@/lib/supabase/admin";
import type { JikanAnime } from "@/lib/jikan";
import type { TablesInsert } from "@/lib/database.types";

/**
 * Fills the shared `anime` catalog from MyAnimeList.
 *
 * ## Why this exists
 *
 * The data chain is MAL → AniList → the local catalog. That third tier is the
 * only one the app controls, and it is normally filled as a side effect of
 * people adding titles ("catalog contributions", migration 0002) — so on a
 * young install it is empty. Which is fine right up until both live engines
 * fail at once, at which point every rail falls through to a tier holding
 * nothing and the app looks broken.
 *
 * Not hypothetical. Observed 2026-08-16: Jikan answering 504 on `/seasons/now`,
 * `/schedules`, `/anime?q=` and every filtered `/top/anime`, while AniList
 * returned `403 "The AniList API has been temporarily disabled due to severe
 * stability issues."` Seeding turns the catalog from a formality into a real
 * backstop.
 *
 * ## Why it's shaped as small batches
 *
 * A full seed is hundreds of rate-limited upstream requests — minutes of
 * wall-clock, far past a serverless function's budget. So one run takes a
 * bounded bite (a couple of pages per source) and is **idempotent**: rows
 * upsert on `mal_id`, so running it repeatedly tops the catalog up and
 * refreshes metadata rather than duplicating. Run it a few times.
 *
 * ## Why it assumes the upstream is unwell
 *
 * It exists *because* Jikan is unreliable, so it must not require a healthy
 * Jikan to make progress: every source is optional, every page is retried
 * once, and a dead page is skipped rather than fatal. The outage also **rolls**
 * — `/top/anime` answered and `/seasons/now` failed one minute, and the exact
 * reverse the next — which is why it sweeps several endpoints instead of
 * trusting one. A partial seed is a good outcome.
 *
 * Service-role only (it writes a shared table on nobody's behalf), so callers
 * must sit behind `requireAdmin()`.
 */

/** Jikan permits ~3 req/s; stay well under — this is a background chore. */
const REQUEST_SPACING_MS = 400;
const UPSTREAM_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 100;

/**
 * Breadth is deliberate: during a partial outage some of these answer while
 * others 504, and a rail can only degrade to rows that exist — the movies rail
 * needs movie rows, "currently airing" needs airing rows.
 */
const SOURCES = [
  "/top/anime",
  "/top/anime?filter=bypopularity",
  "/top/anime?filter=airing",
  "/top/anime?filter=upcoming",
  "/top/anime?type=movie",
  "/seasons/now",
  "/seasons/upcoming",
] as const;

const STATUS: Record<string, TablesInsert<"anime">["status"]> = {
  "Finished Airing": "finished_airing",
  "Currently Airing": "currently_airing",
  "Not yet aired": "not_yet_aired",
};

const TYPE: Record<string, TablesInsert<"anime">["type"]> = {
  TV: "tv",
  "TV Special": "special",
  Movie: "movie",
  OVA: "ova",
  ONA: "ona",
  Special: "special",
  Music: "music",
};

const SEASON_NAMES = new Set(["winter", "spring", "summer", "fall"]);

/** Jikan's ratings are prose: "PG-13 - Teens 13 or older". */
function toRating(rating: string | null | undefined) {
  if (!rating) return null;
  const head = rating.split(" - ")[0]!.trim().toLowerCase();
  const map: Record<string, TablesInsert<"anime">["rating"]> = {
    g: "g",
    pg: "pg",
    "pg-13": "pg_13",
    r: "r_17",
    "r+": "r_plus",
    rx: "rx",
  };
  return map[head] ?? null;
}

/** Null for records the catalog can't use (no id, or no title to show). */
export function toCatalogRow(
  a: JikanAnime & { rating?: string | null },
): TablesInsert<"anime"> | null {
  if (!a || typeof a.mal_id !== "number" || !a.title) return null;

  const season =
    typeof a.season === "string" && SEASON_NAMES.has(a.season.toLowerCase())
      ? (a.season.toLowerCase() as TablesInsert<"anime">["season"])
      : null;

  const row: TablesInsert<"anime"> = {
    mal_id: a.mal_id,
    title: a.title,
    title_english: a.title_english ?? null,
    synopsis: a.synopsis ?? null,
    poster_url:
      a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
    score: a.score ?? null,
    studio: a.studios?.[0]?.name ?? null,
    total_episodes: a.episodes ?? null,
    status: STATUS[a.status as string] ?? "finished_airing",
    year: a.year ?? null,
    season,
    airing_start: a.aired?.from ?? null,
    airing_end: a.aired?.to ?? null,
    rating: toRating(a.rating),
    genres: (a.genres ?? []).map((g) => g.name).filter(Boolean),
  };

  // `type` is an enum with no catch-all member, and Jikan also returns "CM"
  // and "PV". Omitting an unmapped kind lets the column default apply instead
  // of failing the whole batch.
  const type = TYPE[a.type ?? ""];
  if (type) row.type = type;

  return row;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One page, or null when it's unavailable. Never throws. */
async function fetchPage(path: string, page: number): Promise<JikanAnime[] | null> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.jikan.moe/v4${path}${sep}page=${page}&limit=25&sfw=true`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: JikanAnime[] };
        return Array.isArray(body.data) ? body.data : [];
      }
      if (attempt === 1) await sleep(1200);
    } catch {
      if (attempt === 1) await sleep(1200);
    }
  }
  return null;
}

export type SeedResult = {
  /** Unique titles written this run. */
  written: number;
  pagesOk: number;
  pagesFailed: number;
};

/**
 * Sweep every source for `pagesPerSource` pages and upsert what came back.
 *
 * @param pagesPerSource kept small — this runs inside a request.
 */
export async function seedCatalog(pagesPerSource = 2): Promise<SeedResult> {
  // Dedupe across sources before writing: the charts overlap heavily, and one
  // upsert per unique title beats sending the same row seven times.
  const byMalId = new Map<number, TablesInsert<"anime">>();
  let pagesOk = 0;
  let pagesFailed = 0;

  for (const path of SOURCES) {
    for (let page = 1; page <= pagesPerSource; page++) {
      const data = await fetchPage(path, page);
      if (data === null) {
        pagesFailed++;
        // This source is unwell; don't spend the budget on its later pages.
        break;
      }
      pagesOk++;
      for (const item of data) {
        const row = toCatalogRow(item);
        if (row?.mal_id != null) byMalId.set(row.mal_id, row);
      }
      if (data.length === 0) break; // ran off the end of this chart
      await sleep(REQUEST_SPACING_MS);
    }
  }

  const rows = [...byMalId.values()];
  if (rows.length === 0) return { written: 0, pagesOk, pagesFailed };

  const supabase = createAdminClient();
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("anime")
      .upsert(batch, { onConflict: "mal_id" });
    if (error) throw new Error(`Catalog upsert failed: ${error.message}`);
    written += batch.length;
  }

  return { written, pagesOk, pagesFailed };
}

/** How many titles the fallback tier currently has to work with. */
export async function catalogSize(): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("anime")
    .select("id", { count: "exact", head: true })
    .not("mal_id", "is", null);
  return count ?? 0;
}
