import { createClient } from "@/lib/supabase/server";
import type { WatchStatus } from "@/types/anime";

/**
 * Aggregated watch statistics for the signed-in user — powers the
 * "My Progress" tab and the Anime Wrapped share card. All queries run under
 * RLS (rows are scoped to auth.uid()), so no user filter is applied.
 *
 * Hours are an estimate: the catalog doesn't store per-episode runtimes, so
 * TV/OVA/ONA/special episodes count ~24 min and movies ~100 min.
 */

const TV_EPISODE_MINUTES = 24;
const MOVIE_MINUTES = 100;

export type GenreCount = { name: string; count: number };

export type UserStats = {
  totalAnime: number;
  byStatus: Record<WatchStatus, number>;
  episodesWatched: number;
  hoursWatched: number;
  /** Mean of the user's own scores, null when nothing is rated. */
  meanScore: number | null;
  /** Score histogram — index 0 is score 1, index 9 is score 10. */
  scoreDist: number[];
  topGenres: GenreCount[];
  byType: { type: string; count: number }[];
  /** Consecutive days (ending today or yesterday) with ≥1 episode watched. */
  currentStreak: number;
  longestStreak: number;
  /** The single day with the most episodes watched. */
  bestDay: { date: string; count: number } | null;
  firstActivity: string | null;
  /** Years that have any watch activity, newest first (drives Wrapped). */
  activeYears: number[];
};

export type YearStats = {
  year: number;
  episodesWatched: number;
  hoursWatched: number;
  /** Distinct anime with at least one episode watched that year. */
  animeTouched: number;
  completed: number;
  topGenres: GenreCount[];
  bestDay: { date: string; count: number } | null;
  longestStreak: number;
  /** Highest-scored anime the user rated that finished that year of watching. */
  topRated: { title: string; score: number } | null;
};

type ProgressRow = {
  status: WatchStatus;
  score: number | null;
  episodes_watched: number;
  completed_at: string | null;
  anime: {
    id: string;
    title: string;
    title_english: string | null;
    type: string | null;
    genres: string[] | null;
  } | null;
};

type EpisodeRow = {
  watched_at: string;
  episode: { anime_id: string } | null;
};

const EMPTY_STATUS: Record<WatchStatus, number> = {
  watching: 0,
  completed: 0,
  plan_to_watch: 0,
  on_hold: 0,
  dropped: 0,
};

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Longest run of consecutive dates within the (unique, sorted) day list. */
function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = Date.parse(d);
    run = prev != null && t - prev === 86_400_000 ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

/** Run of consecutive dates ending today or yesterday. */
function currentRun(days: string[]): number {
  if (days.length === 0) return 0;
  const today = dayOf(new Date().toISOString());
  const yesterday = dayOf(new Date(Date.now() - 86_400_000).toISOString());
  const set = new Set(days);
  const cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;
  let run = 0;
  let t = Date.parse(cursor);
  while (set.has(dayOf(new Date(t).toISOString()))) {
    run++;
    t -= 86_400_000;
  }
  return run;
}

function tally(days: string[]): { best: { date: string; count: number } | null } {
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: { date: string; count: number } | null = null;
  for (const [date, count] of counts) {
    if (!best || count > best.count) best = { date, count };
  }
  return { best };
}

function topGenresOf(genreLists: (string[] | null | undefined)[], limit = 10): GenreCount[] {
  const counts = new Map<string, number>();
  for (const list of genreLists) {
    for (const g of list ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function fetchRows(): Promise<{
  progress: ProgressRow[];
  episodes: EpisodeRow[];
}> {
  const supabase = await createClient();

  const { data: progressData, error } = await supabase
    .from("user_progress")
    .select(
      "status, score, episodes_watched, completed_at, anime:anime_id (id, title, title_english, type, genres)",
    );
  if (error) throw new Error(error.message);

  // Every watched-episode event with its anime, for hours/streaks/years.
  const { data: episodeData, error: epError } = await supabase
    .from("episode_progress")
    .select("watched_at, episode:episode_id (anime_id)")
    .order("watched_at", { ascending: true })
    .limit(20_000);
  if (epError) throw new Error(epError.message);

  return {
    progress: (progressData ?? []) as unknown as ProgressRow[],
    episodes: (episodeData ?? []) as unknown as EpisodeRow[],
  };
}

export async function getUserStats(): Promise<UserStats> {
  const { progress, episodes } = await fetchRows();

  const byStatus = { ...EMPTY_STATUS };
  const scoreDist = Array.from({ length: 10 }, () => 0);
  let scoreSum = 0;
  let scoreCount = 0;
  const typeCounts = new Map<string, number>();
  const movieIds = new Set<string>();

  for (const row of progress) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.score != null && row.score >= 1 && row.score <= 10) {
      scoreDist[row.score - 1]!++;
      scoreSum += row.score;
      scoreCount++;
    }
    const type = row.anime?.type ?? "unknown";
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    if (row.anime?.type === "movie" && row.anime) movieIds.add(row.anime.id);
  }

  // Episodes watched: prefer the per-episode log; entries tracked only via the
  // "episodes watched" counter (no checklist) still count through user_progress.
  const loggedByAnime = new Map<string, number>();
  for (const ep of episodes) {
    const id = ep.episode?.anime_id;
    if (id) loggedByAnime.set(id, (loggedByAnime.get(id) ?? 0) + 1);
  }
  let episodesWatched = 0;
  let minutes = 0;
  for (const row of progress) {
    const animeId = row.anime?.id;
    const logged = animeId ? (loggedByAnime.get(animeId) ?? 0) : 0;
    const count = Math.max(logged, row.episodes_watched ?? 0);
    episodesWatched += count;
    minutes +=
      count * (row.anime?.type === "movie" ? MOVIE_MINUTES : TV_EPISODE_MINUTES);
  }

  const days = [...new Set(episodes.map((e) => dayOf(e.watched_at)))].sort();
  const allDays = episodes.map((e) => dayOf(e.watched_at));
  const { best } = tally(allDays);

  const years = [
    ...new Set(episodes.map((e) => Number(e.watched_at.slice(0, 4)))),
  ].sort((a, b) => b - a);

  return {
    totalAnime: progress.length,
    byStatus,
    episodesWatched,
    hoursWatched: Math.round(minutes / 60),
    meanScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    scoreDist,
    topGenres: topGenresOf(progress.map((r) => r.anime?.genres)),
    byType: [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    currentStreak: currentRun(days),
    longestStreak: longestRun(days),
    bestDay: best,
    firstActivity: episodes[0]?.watched_at ?? null,
    activeYears: years,
  };
}

/** Wrapped: the same rows sliced down to a single calendar year. */
export async function getYearStats(year: number): Promise<YearStats> {
  const { progress, episodes } = await fetchRows();

  const inYear = episodes.filter(
    (e) => Number(e.watched_at.slice(0, 4)) === year,
  );
  const animeIds = new Set(
    inYear.map((e) => e.episode?.anime_id).filter(Boolean) as string[],
  );

  const genreLists: (string[] | null | undefined)[] = [];
  let topRated: { title: string; score: number } | null = null;
  let completed = 0;
  let minutes = 0;
  const byAnime = new Map<string, number>();
  for (const e of inYear) {
    const id = e.episode?.anime_id;
    if (id) byAnime.set(id, (byAnime.get(id) ?? 0) + 1);
  }
  for (const row of progress) {
    const id = row.anime?.id;
    if (!id || !animeIds.has(id)) continue;
    genreLists.push(row.anime?.genres);
    const count = byAnime.get(id) ?? 0;
    minutes +=
      count * (row.anime?.type === "movie" ? MOVIE_MINUTES : TV_EPISODE_MINUTES);
    if (
      row.score != null &&
      (topRated == null || row.score > topRated.score)
    ) {
      topRated = {
        title: row.anime?.title_english ?? row.anime?.title ?? "—",
        score: row.score,
      };
    }
  }
  for (const row of progress) {
    if (row.completed_at && Number(row.completed_at.slice(0, 4)) === year) {
      completed++;
    }
  }

  const days = [...new Set(inYear.map((e) => dayOf(e.watched_at)))].sort();
  const { best } = tally(inYear.map((e) => dayOf(e.watched_at)));

  return {
    year,
    episodesWatched: inYear.length,
    hoursWatched: Math.round(minutes / 60),
    animeTouched: animeIds.size,
    completed,
    topGenres: topGenresOf(genreLists, 5),
    bestDay: best,
    longestStreak: longestRun(days),
    topRated,
  };
}
