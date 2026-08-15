import { browseCatalog } from "@/lib/catalog-fallback";
import { getAnilistUpcoming, searchAnilist } from "@/lib/anilist";
import {
  getSeasonNow,
  getTopAnime,
  getTopByPopularity,
  getTopRated,
  getUpcomingSeasons,
  type JikanAnime,
} from "@/lib/jikan";
import { SEASONS, type Season } from "@/lib/search-filters";

/**
 * The home page's discovery rails, each with the three-engine fallback the rest
 * of the app already had: MAL (Jikan) → AniList → the local catalog.
 *
 * ## The bug this fixes
 *
 * The home page was a patchwork. "Just Finished", "Top Movies" and the schedule
 * rail each degraded to AniList when MAL wobbled — but the **Discovery tabs**
 * (Newest / Popular / Top Rated), **Top Airing** and **Upcoming** were written
 * as `getX().catch(() => [])` with nothing after the catch. So a MAL outage
 * emptied the three biggest tabs on the landing page while the small rails
 * beside them carried on, which reads to a user as "the app is broken" rather
 * than "one upstream is down".
 *
 * Observed while diagnosing exactly that: every `api.jikan.moe/v4` endpoint
 * answering **504**, and the home page's tabs blank as a result.
 *
 * This is `top-ten.ts` generalised — same module shape, same reason for
 * existing (the chain has to reach AniList and Supabase, and `jikan.ts` must
 * not import either or the dependency cycles).
 *
 * ## The rule
 *
 * **Empty is a failure.** MAL's degraded mode answers `200 {"data": []}`
 * instead of erroring, so nothing throws, `jikanFetch`'s last-good cache never
 * engages, and an empty array sails through to the UI looking like the truth.
 * None of these rails is ever legitimately empty — there is always a most
 * popular anime — so "no rows" always means the engine is unwell and the next
 * tier should get its turn.
 */

/** Ask for extra so dedupe can't leave the rail short. */
const OVERFETCH = 6;

/** The anime season a date falls in (winter = Jan–Mar … fall = Oct–Dec). */
function seasonOf(date: Date): Season {
  return SEASONS[Math.floor(date.getMonth() / 3)]!;
}

/** Dedupe by mal_id — top charts repeat ids across pages — and cut to size. */
function dedupe(list: JikanAnime[], limit: number): JikanAnime[] {
  const seen = new Set<number>();
  const unique = list.filter((a) => {
    if (a.mal_id == null || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
  return unique.slice(0, limit);
}

/**
 * Run a rail's tiers in order, taking the first that yields anything.
 *
 * Never throws: a rail is one section of a busy page, and a dead upstream
 * should cost that section, not the render. Callers get `[]` only when every
 * tier is unreachable.
 */
async function firstNonEmpty(
  rail: string,
  limit: number,
  tiers: { name: string; run: () => Promise<JikanAnime[]> }[],
): Promise<JikanAnime[]> {
  for (const tier of tiers) {
    try {
      const list = dedupe(await tier.run(), limit);
      if (list.length > 0) return list;
      console.warn(`[discovery] ${tier.name} returned an empty ${rail} rail`);
    } catch (err) {
      console.error(`[discovery] ${tier.name} failed for ${rail}:`, err);
    }
  }
  return [];
}

/** This season's new shows. */
export function getNewestAnime(limit = 18): Promise<JikanAnime[]> {
  const now = new Date();
  return firstNonEmpty("newest", limit, [
    { name: "MAL", run: () => getSeasonNow(limit + OVERFETCH).then((r) => r.data) },
    {
      name: "AniList",
      run: () =>
        searchAnilist(
          { season: seasonOf(now), year: now.getFullYear() },
          1,
        ).then((r) => r.data),
    },
    { name: "catalog", run: () => browseCatalog(limit + OVERFETCH) },
  ]);
}

/** Most-watched titles overall. */
export function getPopularAnime(limit = 18): Promise<JikanAnime[]> {
  return firstNonEmpty("popular", limit, [
    {
      name: "MAL",
      run: () => getTopByPopularity(limit + OVERFETCH).then((r) => r.data),
    },
    {
      name: "AniList",
      run: () => searchAnilist({ sort: "POPULARITY_DESC" }, 1).then((r) => r.data),
    },
    { name: "catalog", run: () => browseCatalog(limit + OVERFETCH) },
  ]);
}

/** Highest-scored titles. */
export function getTopRatedAnime(limit = 18): Promise<JikanAnime[]> {
  return firstNonEmpty("top-rated", limit, [
    { name: "MAL", run: () => getTopRated(limit + OVERFETCH).then((r) => r.data) },
    {
      name: "AniList",
      run: () => searchAnilist({ sort: "SCORE_DESC" }, 1).then((r) => r.data),
    },
    // The catalog is already ordered by score, so this tier is a genuine
    // "top rated" rather than an approximation.
    { name: "catalog", run: () => browseCatalog(limit + OVERFETCH) },
  ]);
}

/** What's on air right now. */
export function getTopAiringAnime(limit = 10): Promise<JikanAnime[]> {
  return firstNonEmpty("top-airing", limit, [
    { name: "MAL", run: () => getTopAnime(limit + OVERFETCH).then((r) => r.data) },
    {
      name: "AniList",
      run: () => searchAnilist({ status: "airing" }, 1).then((r) => r.data),
    },
    { name: "catalog", run: () => browseCatalog(limit + OVERFETCH) },
  ]);
}

/**
 * Announced but not yet airing. The catalog tier is deliberately omitted: it
 * stores no air-date status, so it cannot tell "upcoming" from "finished ten
 * years ago", and a rail captioned *Upcoming* full of old titles is worse than
 * an absent one. This is the one rail allowed to disappear.
 */
export function getUpcomingAnime(limit = 10): Promise<JikanAnime[]> {
  return firstNonEmpty("upcoming", limit, [
    { name: "MAL", run: () => getUpcomingSeasons(1) },
    { name: "AniList", run: () => getAnilistUpcoming(1) },
  ]);
}
