import { browseCatalog } from "@/lib/catalog-fallback";
import {
  getCatalogList,
  getStaleCatalogList,
  type CatalogListKey,
} from "@/lib/catalog";
import {
  getAnilistAiringSchedule,
  getAnilistUpcoming,
  searchAnilist,
} from "@/lib/anilist";
import {
  getJustFinished,
  getSchedules,
  getSeasonNow,
  getTopAnime,
  getTopByPopularity,
  getTopMovies,
  getTopRated,
  getUpcomingSeasons,
  type JikanAnime,
} from "@/lib/jikan";
import { SEASONS, type Season } from "@/lib/search-filters";

/**
 * The home page's discovery rails: our own catalog first, then the live
 * engines, then whatever the catalog still has.
 *
 *   1. **catalog** — the chart snapshot the catalog-sync function keeps
 *      (`src/lib/catalog.ts`), if it is younger than 36h. One query.
 *   2. **MAL** (Jikan), then **AniList** — only when there's no fresh snapshot.
 *   3. **stale catalog** — the same snapshot up to a month old, then the
 *      catalog's best-scored rows.
 *
 * ## Why the catalog leads
 *
 * Jikan was unreachable for days at a time in October 2026, and every rail on
 * the landing page paid for it on every view: a breaker's fast failure at
 * best, an 8s timeout at worst, then AniList's 2.1s rate-limit queue. The sync
 * moves that cost off the request path entirely.
 *
 * ## The rule from before, still in force
 *
 * **Empty is a failure.** MAL's degraded mode answers `200 {"data": []}`
 * instead of erroring, so nothing throws and an empty array sails through to
 * the UI looking like the truth. None of these rails is ever legitimately
 * empty — there is always a most popular anime — so "no rows" always means
 * the tier is unwell (or, for the catalog, that the sync hasn't run) and the
 * next tier should get its turn.
 *
 * (Why a module rather than more of `jikan.ts`: the chain reaches AniList and
 * Supabase, and `jikan.ts` must not import either or the dependencies cycle.)
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

type Tier = { name: string; run: () => Promise<JikanAnime[]> };

/**
 * Run a rail's tiers in order, taking the first that yields anything.
 *
 * Never throws: a rail is one section of a busy page, and a dead upstream
 * should cost that section, not the render. Callers get `[]` only when every
 * tier is unreachable.
 */
async function firstNonEmpty(rail: string, limit: number, tiers: Tier[]): Promise<JikanAnime[]> {
  for (const tier of tiers) {
    try {
      const list = dedupe(await tier.run(), limit);
      if (list.length > 0) return list;
      // A missing snapshot is routine (sync not deployed yet); not worth a warning.
      if (tier.name !== "catalog") {
        console.warn(`[discovery] ${tier.name} returned an empty ${rail} rail`);
      }
    } catch (err) {
      console.error(`[discovery] ${tier.name} failed for ${rail}:`, err);
    }
  }
  return [];
}

/** A rail's full chain: fresh snapshot → `live` tiers → stale snapshot → `last`. */
function catalogFirst(
  key: CatalogListKey,
  limit: number,
  live: Tier[],
  last: Tier[] = [],
): Promise<JikanAnime[]> {
  const n = limit + OVERFETCH;
  return firstNonEmpty(key, limit, [
    { name: "catalog", run: () => getCatalogList(key, n) },
    ...live,
    { name: "stale catalog", run: () => getStaleCatalogList(key, n) },
    ...last,
  ]);
}

const bestScored = (limit: number): Tier[] => [
  { name: "best-scored catalog", run: () => browseCatalog(limit + OVERFETCH) },
];

/** This season's new shows. */
export function getNewestAnime(limit = 18): Promise<JikanAnime[]> {
  const now = new Date();
  return catalogFirst(
    "season-now",
    limit,
    [
      { name: "MAL", run: () => getSeasonNow(limit + OVERFETCH).then((r) => r.data) },
      {
        name: "AniList",
        run: () =>
          searchAnilist({ season: seasonOf(now), year: now.getFullYear() }, 1).then(
            (r) => r.data,
          ),
      },
    ],
    bestScored(limit),
  );
}

/** Most-watched titles overall. */
export function getPopularAnime(limit = 18): Promise<JikanAnime[]> {
  return catalogFirst(
    "popular",
    limit,
    [
      { name: "MAL", run: () => getTopByPopularity(limit + OVERFETCH).then((r) => r.data) },
      {
        name: "AniList",
        run: () => searchAnilist({ sort: "POPULARITY_DESC" }, 1).then((r) => r.data),
      },
    ],
    bestScored(limit),
  );
}

/** Highest-scored titles. */
export function getTopRatedAnime(limit = 18): Promise<JikanAnime[]> {
  return catalogFirst(
    "top-rated",
    limit,
    [
      { name: "MAL", run: () => getTopRated(limit + OVERFETCH).then((r) => r.data) },
      { name: "AniList", run: () => searchAnilist({ sort: "SCORE_DESC" }, 1).then((r) => r.data) },
    ],
    // The catalog is already ordered by score, so this is a genuine "top
    // rated" rather than an approximation.
    bestScored(limit),
  );
}

/** What's on air right now. */
export function getTopAiringAnime(limit = 10): Promise<JikanAnime[]> {
  return catalogFirst(
    "airing",
    limit,
    [
      { name: "MAL", run: () => getTopAnime(limit + OVERFETCH).then((r) => r.data) },
      { name: "AniList", run: () => searchAnilist({ status: "airing" }, 1).then((r) => r.data) },
    ],
    bestScored(limit),
  );
}

/**
 * Announced but not yet airing. No best-scored tier: that list can't tell
 * "upcoming" from "finished ten years ago", and a rail captioned *Upcoming*
 * full of old titles is worse than an absent one. The snapshot can — the sync
 * records the upcoming chart itself — so it gets both catalog tiers.
 */
export function getUpcomingAnime(limit = 10): Promise<JikanAnime[]> {
  return catalogFirst("upcoming", limit, [
    { name: "MAL", run: () => getUpcomingSeasons(1) },
    { name: "AniList", run: () => getAnilistUpcoming(1) },
  ]);
}

/** Recently completed shows, newest end date first. */
export function getJustFinishedAnime(limit = 18): Promise<JikanAnime[]> {
  return catalogFirst("just-finished", limit, [
    { name: "MAL", run: () => getJustFinished(limit).then((r) => r.data) },
    // AniList's nearest equivalent is "finished, by popularity".
    { name: "AniList", run: () => searchAnilist({ status: "complete" }, 1).then((r) => r.data) },
  ]);
}

/** Top movies. */
export function getTopMoviesAnime(limit = 18): Promise<JikanAnime[]> {
  return catalogFirst("top-movies", limit, [
    { name: "MAL", run: () => getTopMovies(limit).then((r) => r.data) },
    { name: "AniList", run: () => searchAnilist({ format: "movie" }, 1).then((r) => r.data) },
  ]);
}

/**
 * Airing shows with a weekly JST slot (`broadcast.day` / `.time`), for the
 * home mini-schedule. The catalog snapshot holds every slotted show, so a
 * generous limit; AniList derives slots from each show's next episode.
 */
export function getScheduleAnime(limit = 200): Promise<JikanAnime[]> {
  return catalogFirst("schedule", limit, [
    { name: "MAL", run: () => getSchedules(3) },
    { name: "AniList", run: () => getAnilistAiringSchedule() },
  ]);
}
