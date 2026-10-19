import { browseCatalog } from "@/lib/catalog-fallback";
import { getCatalogList, getStaleCatalogList } from "@/lib/catalog";
import { searchAnilist } from "@/lib/anilist";
import { getTopTen, type JikanAnime, type TopWindow } from "@/lib/jikan";
import { SEASONS, type Season } from "@/lib/search-filters";

/**
 * The home page's Top 10 chart: the catalog-sync snapshot first (one query,
 * no upstream), then MAL (Jikan) → AniList → the catalog's older snapshot or
 * best-scored rows. See `discovery.ts` for why the catalog leads.
 *
 * Why this module exists instead of a few more lines in `jikan.ts`: the chain
 * has to reach AniList and Supabase, and `jikan.ts` must not import either
 * (anilist.ts already imports Jikan's types, so the dependency would cycle).
 * The search route orchestrates its chain in the route for the same reason;
 * this is that pattern, extracted so the home page can share it.
 *
 * ## The bug this fixes
 *
 * `getTopTen` alone had no fallback, so the chart went blank the moment MAL
 * wobbled — while every other surface degraded to AniList and kept working.
 * Worse, it failed *silently*: MAL's degraded mode answers `200 {"data": []}`
 * rather than erroring, so nothing threw, `jikanFetch`'s last-good cache never
 * engaged, and an empty array sailed through to the UI as if it were the truth.
 *
 * Hence the rule below: **an empty chart is treated as a failure.** A Top 10 is
 * never legitimately empty — unlike a search, which may genuinely match nothing
 * — so "no rows" here always means the engine is unwell, and the next tier
 * should get its turn.
 */

/** Ten is the chart size; ask for a few extra so dedupe can't leave a gap. */
const FETCH_LIMIT = 24;
const CHART_SIZE = 10;

/** The anime season a date falls in (winter = Jan–Mar … fall = Oct–Dec). */
function seasonOf(date: Date): Season {
  return SEASONS[Math.floor(date.getMonth() / 3)]!;
}

/** Dedupe by mal_id, rank by viewer count, cut to the chart size. */
function rank(list: JikanAnime[]): JikanAnime[] {
  const seen = new Set<number>();
  const unique = list.filter((a) => {
    if (a.mal_id == null || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
  unique.sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
  return unique.slice(0, CHART_SIZE);
}

/**
 * AniList equivalents of the three windows. `searchAnilist` sorts by popularity
 * for an unqueried browse, which is the same axis the chart displays ("viewers"),
 * so the windows differ by *filter* rather than by sort:
 *
 *  - weekly  → what is on air right now
 *  - monthly → this season
 *  - yearly  → everything that started this year
 */
async function fromAnilist(window: TopWindow): Promise<JikanAnime[]> {
  const now = new Date();
  const year = now.getFullYear();

  const filters =
    window === "weekly"
      ? { status: "airing" as const }
      : window === "monthly"
        ? { season: seasonOf(now), year }
        : { minYear: year, maxYear: year };

  const res = await searchAnilist(filters, 1);
  return res.data;
}

/**
 * One ranking window, from whichever engine is standing.
 *
 * Never throws: the chart is one section of a busy page, and a dead upstream
 * should cost that section, not the render. Callers get `[]` only when all
 * three tiers are unreachable.
 */
export async function getTopTenChart(window: TopWindow): Promise<JikanAnime[]> {
  const key = `top10-${window}` as const;

  // Tier 0 — the synced snapshot (already ranked by viewers; rank() is a no-op
  // on it beyond the cut). Empty means none younger than 36h.
  try {
    const ranked = rank(await getCatalogList(key, FETCH_LIMIT));
    if (ranked.length > 0) return ranked;
  } catch (err) {
    console.error(`[top-ten] catalog failed for ${window}:`, err);
  }

  // Tier 1 — MAL, the primary engine everywhere else in the app.
  try {
    const ranked = rank(await getTopTen(window));
    if (ranked.length > 0) return ranked;
    console.warn(`[top-ten] MAL returned an empty ${window} chart; trying AniList`);
  } catch (err) {
    console.error(`[top-ten] MAL failed for ${window}:`, err);
  }

  // Tier 2 — AniList, the app's standard backup engine.
  try {
    const ranked = rank(await fromAnilist(window));
    if (ranked.length > 0) return ranked;
    console.warn(`[top-ten] AniList returned an empty ${window} chart; trying catalog`);
  } catch (err) {
    console.error(`[top-ten] AniList failed for ${window}:`, err);
  }

  // Tier 3 — our own catalog: an old snapshot of this exact window if there is
  // one, else the best-scored list. That one can't express "this week" or
  // "this season", so all three tabs collapse to it. Deliberate: a real chart
  // that is less precise beats three empty ones, and this only happens when
  // both live engines are down and the sync has never run.
  try {
    const stale = rank(await getStaleCatalogList(key, FETCH_LIMIT));
    if (stale.length > 0) return stale;
    return rank(await browseCatalog(FETCH_LIMIT));
  } catch (err) {
    console.error(`[top-ten] catalog fallback failed for ${window}:`, err);
    return [];
  }
}
