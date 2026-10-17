import { describe, expect, it } from "vitest";

import {
  computeLibraryStats,
  formatCount,
  formatWatchTime,
  MINUTES_PER_EPISODE,
  type LibraryStatsInput,
} from "@/lib/library-stats";

/**
 * The stats bar re-derives these on every keystroke in the library search, so
 * a wrong number is shown instantly and silently. The edge cases below are the
 * ones real libraries contain: airing shows with no total, unscored entries,
 * and counters that ran past the episode count.
 */

function entry(overrides: Partial<LibraryStatsInput> = {}): LibraryStatsInput {
  return {
    status: "watching",
    episodesWatched: 0,
    totalEpisodes: 12,
    score: null,
    ...overrides,
  };
}

describe("computeLibraryStats", () => {
  it("is all zeros and nulls for an empty result", () => {
    const s = computeLibraryStats([]);
    expect(s.titles).toBe(0);
    expect(s.episodesWatched).toBe(0);
    expect(s.completion).toEqual({ watched: 0, total: 0, ratio: null, unknownLength: 0 });
    expect(s.meanScore).toBeNull();
    expect(s.scoredTitles).toBe(0);
    expect(s.byStatus).toEqual([]);
  });

  it("counts titles and sums every watched episode", () => {
    const s = computeLibraryStats([
      entry({ episodesWatched: 5 }),
      entry({ episodesWatched: 12, status: "completed" }),
      entry({ episodesWatched: 3, totalEpisodes: null }),
    ]);
    expect(s.titles).toBe(3);
    expect(s.episodesWatched).toBe(20);
    expect(s.minutesWatched).toBe(20 * MINUTES_PER_EPISODE);
  });

  it("leaves titles with an unknown length out of completion, and says how many", () => {
    const s = computeLibraryStats([
      entry({ episodesWatched: 6, totalEpisodes: 12 }),
      entry({ episodesWatched: 40, totalEpisodes: null }),
      entry({ episodesWatched: 4, totalEpisodes: 0 }),
    ]);
    expect(s.completion.total).toBe(12);
    expect(s.completion.watched).toBe(6);
    expect(s.completion.ratio).toBe(0.5);
    expect(s.completion.unknownLength).toBe(2);
  });

  it("caps one title's progress at its length", () => {
    const s = computeLibraryStats([entry({ episodesWatched: 30, totalEpisodes: 12 })]);
    expect(s.completion.ratio).toBe(1);
    // The raw total still reports what was actually logged.
    expect(s.episodesWatched).toBe(30);
  });

  it("averages only the titles the user scored", () => {
    const s = computeLibraryStats([
      entry({ score: 9 }),
      entry({ score: 6 }),
      entry({ score: null }),
    ]);
    expect(s.meanScore).toBe(7.5);
    expect(s.scoredTitles).toBe(2);
  });

  it("lists only present statuses, in display order", () => {
    const s = computeLibraryStats([
      entry({ status: "dropped" }),
      entry({ status: "completed" }),
      entry({ status: "watching" }),
      entry({ status: "completed" }),
    ]);
    expect(s.byStatus).toEqual([
      { status: "watching", count: 1 },
      { status: "completed", count: 2 },
      { status: "dropped", count: 1 },
    ]);
  });
});

describe("formatCount", () => {
  it("groups below ten thousand and compacts above", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(12_900)).toBe("12.9K");
    expect(formatCount(1_200_000)).toBe("1.2M");
  });
});

describe("formatWatchTime", () => {
  it("picks minutes, hours or days by size", () => {
    expect(formatWatchTime(23)).toBe("23 min");
    expect(formatWatchTime(60)).toBe("1 hour");
    expect(formatWatchTime(23 * 60)).toBe("23 hours");
    expect(formatWatchTime(5.5 * 24 * 60)).toBe("5.5 days");
    expect(formatWatchTime(150 * 24 * 60)).toBe("150 days");
  });
});
