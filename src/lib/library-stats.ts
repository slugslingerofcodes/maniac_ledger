import type { WatchStatus } from "@/types/anime";

/**
 * Numbers for the library's stats bar: what the current search / filter
 * actually matched. Pure and synchronous on purpose — it runs on every
 * keystroke over the cached list, so it must stay a single pass with no I/O.
 */

/** The fields the stats read. `LibraryEntryItem` satisfies this structurally. */
export type LibraryStatsInput = {
  status: WatchStatus;
  episodesWatched: number;
  totalEpisodes: number | null;
  score: number | null;
};

/** ~standard TV episode runtime — the same estimate the profile stats use. */
export const MINUTES_PER_EPISODE = 23;

/** Display order for the per-status counts. */
export const STATUS_ORDER: WatchStatus[] = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];

export type LibraryStats = {
  titles: number;
  episodesWatched: number;
  /**
   * Completion over titles whose length is known. Airing shows with no total
   * yet are left out of both sides — counting them would understate progress.
   */
  completion: {
    watched: number;
    total: number;
    /** 0–1, or null when no matched title has a known length. */
    ratio: number | null;
    /** Matched titles excluded because their episode count is unknown. */
    unknownLength: number;
  };
  /** Mean of the 1–10 scores the user has given; null when none are scored. */
  meanScore: number | null;
  scoredTitles: number;
  minutesWatched: number;
  /** Non-zero statuses only, in `STATUS_ORDER`. */
  byStatus: { status: WatchStatus; count: number }[];
};

export function computeLibraryStats(items: readonly LibraryStatsInput[]): LibraryStats {
  let episodesWatched = 0;
  let knownWatched = 0;
  let knownTotal = 0;
  let unknownLength = 0;
  let scoreSum = 0;
  let scoredTitles = 0;
  const counts = new Map<WatchStatus, number>();

  for (const item of items) {
    const watched = Math.max(0, item.episodesWatched);
    episodesWatched += watched;

    if (item.totalEpisodes != null && item.totalEpisodes > 0) {
      knownTotal += item.totalEpisodes;
      // A rewatch or a stale total can push the counter past the length;
      // completion can't exceed 100% for one title.
      knownWatched += Math.min(watched, item.totalEpisodes);
    } else {
      unknownLength += 1;
    }

    if (item.score != null) {
      scoreSum += item.score;
      scoredTitles += 1;
    }

    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  return {
    titles: items.length,
    episodesWatched,
    completion: {
      watched: knownWatched,
      total: knownTotal,
      ratio: knownTotal > 0 ? knownWatched / knownTotal : null,
      unknownLength,
    },
    meanScore: scoredTitles > 0 ? scoreSum / scoredTitles : null,
    scoredTitles,
    minutesWatched: episodesWatched * MINUTES_PER_EPISODE,
    byStatus: STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    })),
  };
}

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const grouped = new Intl.NumberFormat("en");

/** 1,284 below ten thousand; 12.9K / 1.2M above it. */
export function formatCount(n: number): string {
  return Math.abs(n) < 10_000 ? grouped.format(n) : compact.format(n);
}

/** "42 hours" under two days, "5.5 days" from there, "35 min" under an hour. */
export function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const days = hours / 24;
  return `${days >= 100 ? Math.round(days) : days.toFixed(1)} days`;
}
