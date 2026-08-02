import { searchAnilist } from "@/lib/anilist";
import { browseCatalog } from "@/lib/catalog-fallback";
import {
  getSeasonNow,
  getTopByPopularity,
  getTopRated,
  type JikanAnime,
} from "@/lib/jikan";

/**
 * The poster pool behind /cosmos.
 *
 * The mosaic used to be the signed-in user's library, which made it a mirror of
 * /library with nicer physics — and empty for anyone who hadn't added anything
 * yet. It now draws from the wider catalog instead, so the wall is a wall of
 * anime rather than a wall of *your* anime.
 *
 * ## Randomness without cache misses
 *
 * "Random" here is deliberately *not* "fetch random pages". Random page numbers
 * would miss the response cache on essentially every visit, and this page is
 * `force-dynamic`, so each miss is a live round trip on a rate-limited upstream
 * — several seconds before a single tile appears.
 *
 * Instead a small fixed set of pages is the candidate pool (so there are only
 * ever a handful of distinct upstream requests, all cacheable and shared), and
 * the *selection and shuffle* are random per request. The visitor sees a
 * different wall each time; the upstream sees the same few queries.
 */

export type CosmosPoolItem = {
  /** Stable key + link target: /anime/mal/[malId]. */
  malId: number;
  title: string;
  posterUrl: string;
  score: number | null;
};

/** AniList pages are 50 media each; pages 1–8 ≈ the 400 most popular anime. */
const CANDIDATE_PAGES = [1, 2, 3, 4, 5, 6, 7, 8];
/** How many of those pages to blend per visit. Two is ~100 distinct posters. */
const PAGES_PER_VISIT = 3;
/** Plenty: the grid tops out at ~340 tiles and repeats posters to fill. */
const TARGET_SIZE = 180;

/** Fisher–Yates. Returns a new array; never mutates the input. */
function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const posterOf = (a: JikanAnime): string | null =>
  a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null;

/** Keep only entries the mosaic can actually draw and link, deduped by id. */
function toItems(list: JikanAnime[]): CosmosPoolItem[] {
  const seen = new Set<number>();
  const items: CosmosPoolItem[] = [];
  for (const a of list) {
    const poster = posterOf(a);
    // A tile with no art is a grey hole in the wall, and one with no mal_id
    // has nowhere to navigate — both are worse than simply having fewer.
    if (a.mal_id == null || poster == null || seen.has(a.mal_id)) continue;
    seen.add(a.mal_id);
    items.push({
      malId: a.mal_id,
      title: a.title_english ?? a.title,
      posterUrl: poster,
      score: a.score,
    });
  }
  return items;
}

/** Tier 1 — AniList: 50 per request, so a full wall costs very few calls. */
async function fromAnilist(): Promise<JikanAnime[]> {
  const pages = shuffle(CANDIDATE_PAGES).slice(0, PAGES_PER_VISIT);
  const results = await Promise.allSettled(
    pages.map((page) => searchAnilist({}, page)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value.data : []));
}

/**
 * Tier 2 — MAL. Its list endpoints cap at 25 and don't paginate here, so this
 * blends three different charts to get variety instead of depth. These are the
 * same calls the home page makes, so they are usually already cached.
 */
async function fromJikan(): Promise<JikanAnime[]> {
  const results = await Promise.allSettled([
    getTopRated(25),
    getTopByPopularity(25),
    getSeasonNow(25),
  ]);
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value.data : []));
}

/**
 * A shuffled pool of anime posters for the mosaic.
 *
 * Never throws — /cosmos is decorative, and an error screen where a poster wall
 * should be helps nobody. An empty result renders the page's own empty state.
 */
export async function getCosmosPool(
  size = TARGET_SIZE,
): Promise<CosmosPoolItem[]> {
  for (const [name, fetchList] of [
    ["anilist", fromAnilist],
    ["mal", fromJikan],
    ["catalog", () => browseCatalog(size)],
  ] as const) {
    try {
      const items = toItems(await fetchList());
      if (items.length > 0) return shuffle(items).slice(0, size);
      console.warn(`[cosmos] ${name} returned no usable posters`);
    } catch (err) {
      console.error(`[cosmos] ${name} pool failed:`, err);
    }
  }
  return [];
}
