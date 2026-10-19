import { describe, expect, it } from "vitest";

import { CATALOG_LIST_KEYS } from "@/lib/catalog";
import type { Enums } from "@/lib/database.types";
import {
  ANILIST_PAGES_PER_REQUEST,
  anilistCharts,
  anilistDocument,
  anilistLists,
  chartIds,
  fromAnilist,
  fromJikan,
  isoDay,
  jikanCharts,
  jikanLists,
  jstSlot,
  LIST_CAP,
  LIST_KEYS,
  mergeAll,
  mergeRows,
  parseDurationMins,
  pickLists,
  type AnilistRecord,
  type CatalogRow,
  type JikanRecord,
} from "../../supabase/functions/catalog-sync/mapping";

/**
 * The catalog-sync Edge Function's mapping: upstream records → `anime` rows
 * and chart snapshots. It runs on Deno, every six hours, out of sight — and
 * every page now reads what it writes first. So this is where a wrong field
 * would surface as a wrong home page for everyone, and the only place it can
 * be caught before it ships.
 *
 * The other half of the contract is Postgres: `catalog_sync_apply` (0030)
 * inserts these rows into typed columns, and one bad value — an enum member
 * that doesn't exist, a score of 85, an end date before the start — fails the
 * whole batch. Hence the tests that feed garbage and expect null.
 */

/** A full Jikan v4 record, shaped like `/top/anime`'s entries. */
function jikanRecord(overrides: Partial<JikanRecord> = {}): JikanRecord {
  return {
    mal_id: 52991,
    title: "Sousou no Frieren",
    title_english: "Frieren: Beyond Journey's End",
    title_synonyms: ["Frieren at the Funeral"],
    synopsis: "An elf mage outlives her party.",
    type: "TV",
    episodes: 28,
    duration: "24 min per ep",
    score: 9.31,
    members: 1_234_567,
    status: "Finished Airing",
    rating: "PG-13 - Teens 13 or older",
    season: "fall",
    year: 2023,
    aired: { from: "2023-09-29T00:00:00+00:00", to: "2024-03-22T00:00:00+00:00" },
    broadcast: { day: "Fridays", time: "23:00" },
    trailer: { youtube_id: null, embed_url: "https://www.youtube.com/embed/qgQ0G9tq0eI?autoplay=1" },
    images: { jpg: { image_url: "https://cdn.myanimelist.net/p.jpg", large_image_url: "https://cdn.myanimelist.net/l.jpg" } },
    genres: [{ name: "Adventure" }, { name: "Drama" }, { name: "Fantasy" }],
    explicit_genres: [],
    studios: [{ name: "Madhouse" }],
    ...overrides,
  };
}

/** A full AniList media record, as ANILIST_MEDIA_FIELDS selects it. */
function anilistRecord(overrides: Partial<AnilistRecord> = {}): AnilistRecord {
  return {
    id: 154587,
    idMal: 52991,
    isAdult: false,
    title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey’s End" },
    synonyms: ["葬送のフリーレン"],
    description: "An elf <i>mage</i>.<br>Outlives &amp; remembers.",
    format: "TV",
    status: "FINISHED",
    episodes: 28,
    duration: 24,
    averageScore: 91,
    popularity: 400_000,
    season: "FALL",
    seasonYear: 2023,
    startDate: { year: 2023, month: 9, day: 29 },
    endDate: { year: 2024, month: 3, day: 22 },
    coverImage: { extraLarge: "https://s4.anilist.co/xl.jpg", large: "https://s4.anilist.co/l.jpg" },
    bannerImage: "https://s4.anilist.co/banner.jpg",
    genres: ["Adventure", "Drama", "Fantasy"],
    studios: { nodes: [{ name: "Madhouse" }] },
    trailer: { id: "qgQ0G9tq0eI", site: "youtube" },
    nextAiringEpisode: null,
    ...overrides,
  };
}

const row = (overrides: Partial<CatalogRow> = {}): CatalogRow => ({
  ...fromJikan(jikanRecord())!,
  ...overrides,
});

describe("fromJikan", () => {
  it("maps a full record onto every catalog column", () => {
    expect(fromJikan(jikanRecord())).toEqual({
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren: Beyond Journey's End",
      title_synonyms: ["Frieren at the Funeral"],
      synopsis: "An elf mage outlives her party.",
      poster_url: "https://cdn.myanimelist.net/l.jpg",
      banner_url: null,
      trailer_youtube_id: "qgQ0G9tq0eI",
      score: 9.31,
      members: 1_234_567,
      studio: "Madhouse",
      total_episodes: 28,
      duration_mins: 24,
      status: "finished_airing",
      airing_start: "2023-09-29",
      airing_end: "2024-03-22",
      rating: "pg_13",
      season: "fall",
      year: 2023,
      type: "tv",
      genres: ["Adventure", "Drama", "Fantasy"],
      broadcast_day: "Fridays",
      broadcast_time: "23:00",
    });
  });

  it("refuses a record with no id or no title (the catalog can't key or show it)", () => {
    expect(fromJikan(jikanRecord({ mal_id: null }))).toBeNull();
    expect(fromJikan(jikanRecord({ mal_id: "52991" }))).toBeNull();
    expect(fromJikan(jikanRecord({ title: "  " }))).toBeNull();
  });

  it.each([
    ["Finished Airing", "finished_airing"],
    ["Currently Airing", "currently_airing"],
    ["Not yet aired", "not_yet_aired"],
    ["Something new", null],
  ])("maps status %s → %s", (status, expected) => {
    expect(fromJikan(jikanRecord({ status }))!.status).toBe(expected);
  });

  it.each([
    ["TV", "tv"],
    ["TV Special", "special"],
    ["Movie", "movie"],
    ["OVA", "ova"],
    ["ONA", "ona"],
    ["Special", "special"],
    ["Music", "music"],
    // The enum has no catch-all: an unknown kind is null, so the column
    // default applies on insert and an existing row keeps its own.
    ["CM", null],
    ["PV", null],
  ])("maps type %s → %s", (type, expected) => {
    expect(fromJikan(jikanRecord({ type }))!.type).toBe(expected);
  });

  it.each([
    ["G - All Ages", "g"],
    ["PG - Children", "pg"],
    ["PG-13 - Teens 13 or older", "pg_13"],
    ["R - 17+ (violence & profanity)", "r_17"],
    ["R+ - Mild Nudity", "r_plus"],
    ["Rx - Hentai", "rx"],
    ["None", null],
  ])("reads the rating prose %s → %s", (rating, expected) => {
    expect(fromJikan(jikanRecord({ rating }))!.rating).toBe(expected);
  });

  it("counts explicit genres, which is where Hentai lives — every SFW read keys on it", () => {
    const r = fromJikan(jikanRecord({ explicit_genres: [{ name: "Hentai" }] }))!;

    expect(r.genres).toContain("Hentai");
  });

  it("takes the trailer id itself when Jikan provides it", () => {
    const r = fromJikan(jikanRecord({ trailer: { youtube_id: "abcdefgh123", embed_url: null } }))!;

    expect(r.trailer_youtube_id).toBe("abcdefgh123");
  });

  it("falls back to the premiere year when `year` is null (movies, OVAs)", () => {
    const r = fromJikan(jikanRecord({ year: null, aired: { from: "2016-08-26T00:00:00+00:00", to: null } }))!;

    expect(r.year).toBe(2016);
  });

  it("nulls every value the database would reject, instead of failing the batch", () => {
    const r = fromJikan(
      jikanRecord({
        score: 85, // numeric(4,2), 0–10
        members: -1,
        episodes: 1.5,
        season: "monsoon",
        year: 1066,
        broadcast: { day: "Someday", time: "25:99" },
        trailer: { youtube_id: "<script>", embed_url: "https://example.com/not-youtube" },
        aired: { from: "2024-03-22", to: "2023-09-29" }, // ends before it starts
      }),
    )!;

    expect(r).toMatchObject({
      score: null,
      members: null,
      total_episodes: null,
      season: null,
      broadcast_day: null,
      broadcast_time: null,
      trailer_youtube_id: null,
      airing_start: "2024-03-22",
      // The pair is kept valid: start stays, the impossible end goes.
      airing_end: null,
    });
    // An out-of-range year falls back to the premiere date's.
    expect(r.year).toBe(2024);
  });

  it("rounds a score to the column's two decimals", () => {
    expect(fromJikan(jikanRecord({ score: 8.876 }))!.score).toBe(8.88);
  });

  it("dedupes and caps synonyms", () => {
    const many = Array.from({ length: 40 }, (_, i) => `alias ${i % 30}`);
    const r = fromJikan(jikanRecord({ title_synonyms: ["AoT", "AoT", "", ...many] }))!;

    expect(r.title_synonyms[0]).toBe("AoT");
    expect(new Set(r.title_synonyms).size).toBe(r.title_synonyms.length);
    expect(r.title_synonyms.length).toBeLessThanOrEqual(20);
  });
});

describe("fromAnilist", () => {
  it("maps a full record, including what only AniList has", () => {
    expect(fromAnilist(anilistRecord())).toMatchObject({
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren: Beyond Journey’s End",
      title_synonyms: ["葬送のフリーレン"],
      synopsis: "An elf mage.\nOutlives & remembers.",
      poster_url: "https://s4.anilist.co/xl.jpg",
      banner_url: "https://s4.anilist.co/banner.jpg",
      trailer_youtube_id: "qgQ0G9tq0eI",
      score: 9.1,
      // AniList's popularity stands in for MAL's members, as the app's
      // AniList fallback already does.
      members: 400_000,
      studio: "Madhouse",
      total_episodes: 28,
      duration_mins: 24,
      status: "finished_airing",
      airing_start: "2023-09-29",
      airing_end: "2024-03-22",
      rating: null,
      season: "fall",
      year: 2023,
      type: "tv",
      genres: ["Adventure", "Drama", "Fantasy"],
    });
  });

  it("refuses records without a MAL id — the catalog is keyed by it", () => {
    expect(fromAnilist(anilistRecord({ idMal: null }))).toBeNull();
  });

  it("refuses adult media whatever the query asked for", () => {
    expect(fromAnilist(anilistRecord({ isAdult: true }))).toBeNull();
  });

  it.each([
    ["FINISHED", "finished_airing"],
    ["RELEASING", "currently_airing"],
    ["NOT_YET_RELEASED", "not_yet_aired"],
    ["CANCELLED", "cancelled"],
    ["HIATUS", "hiatus"],
  ])("maps status %s → %s", (status, expected) => {
    expect(fromAnilist(anilistRecord({ status }))!.status).toBe(expected);
  });

  it("treats TV_SHORT as tv", () => {
    expect(fromAnilist(anilistRecord({ format: "TV_SHORT" }))!.type).toBe("tv");
  });

  it("drops a Dailymotion trailer — the players embed YouTube only", () => {
    expect(
      fromAnilist(anilistRecord({ trailer: { id: "x8abcd1", site: "dailymotion" } }))!.trailer_youtube_id,
    ).toBeNull();
  });

  it("places an airing show in its JST slot from the next episode", () => {
    // 2026-10-17 14:00 UTC = Saturday 23:00 in Tokyo.
    const airingAt = Date.UTC(2026, 9, 17, 14, 0) / 1000;
    const r = fromAnilist(
      anilistRecord({ status: "RELEASING", nextAiringEpisode: { airingAt } }),
    )!;

    expect(r).toMatchObject({ broadcast_day: "Saturdays", broadcast_time: "23:00" });
  });

  it("leaves the start date null when AniList knows only the year", () => {
    const r = fromAnilist(anilistRecord({ startDate: { year: 2027, month: null, day: null }, seasonYear: null }))!;

    expect(r.airing_start).toBeNull();
    expect(r.year).toBe(2027);
  });
});

describe("helpers", () => {
  it.each([
    ["24 min per ep", 24],
    ["1 hr 52 min", 112],
    ["2 hr", 120],
    ["30 sec per ep", null],
    ["Unknown", null],
    [null, null],
  ])("parses duration %s → %s", (input, expected) => {
    expect(parseDurationMins(input)).toBe(expected);
  });

  it("normalizes ISO timestamps to the date column's YYYY-MM-DD", () => {
    expect(isoDay("2023-09-29T00:00:00+00:00")).toBe("2023-09-29");
    expect(isoDay("29/09/2023")).toBeNull();
    expect(isoDay("0001-01-01")).toBeNull();
  });

  it("returns null for an unusable airing time", () => {
    expect(jstSlot(null)).toBeNull();
    expect(jstSlot(-5)).toBeNull();
  });
});

describe("mergeRows: MAL wins where it has a value, AniList fills the rest", () => {
  const mal = fromJikan(jikanRecord({ trailer: null }))!;
  const anilist = fromAnilist(
    anilistRecord({ nextAiringEpisode: { airingAt: Date.UTC(2026, 9, 18, 15, 30) / 1000 } }),
  )!;

  it("keeps MAL's score, members and title", () => {
    const merged = mergeRows(mal, anilist)!;

    expect(merged).toMatchObject({ score: 9.31, members: 1_234_567, title: "Sousou no Frieren" });
  });

  it("always takes AniList's banner art, and its trailer when MAL has none", () => {
    const merged = mergeRows(mal, anilist)!;

    expect(merged.banner_url).toBe("https://s4.anilist.co/banner.jpg");
    expect(merged.trailer_youtube_id).toBe("qgQ0G9tq0eI");
  });

  it("moves the broadcast slot as a pair, never MAL's day with AniList's hour", () => {
    expect(mergeRows(mal, anilist)).toMatchObject({ broadcast_day: "Fridays", broadcast_time: "23:00" });

    const noSlot = { ...mal, broadcast_day: null, broadcast_time: "23:00" };
    // 2026-10-18 15:30 UTC is Monday 00:30 in Tokyo: AniList's slot, as a whole.
    expect(mergeRows(noSlot, anilist)).toMatchObject({ broadcast_day: "Mondays", broadcast_time: "00:30" });
  });

  it("moves the airing window as a pair too", () => {
    const noStart = { ...mal, airing_start: null, airing_end: "2099-01-01" };

    expect(mergeRows(noStart, anilist)).toMatchObject({
      airing_start: "2023-09-29",
      airing_end: "2024-03-22",
    });
  });

  it("unions synonyms and falls back to AniList's genres only when MAL has none", () => {
    expect(mergeRows(mal, anilist)!.title_synonyms).toEqual(["Frieren at the Funeral", "葬送のフリーレン"]);
    expect(mergeRows({ ...mal, genres: [] }, { ...anilist, genres: ["Fantasy"] })!.genres).toEqual(["Fantasy"]);
  });

  it("passes a one-engine title through untouched", () => {
    expect(mergeRows(undefined, anilist)).toBe(anilist);
    expect(mergeRows(mal, undefined)).toBe(mal);
  });

  it("mergeAll yields one row per title across both engines", () => {
    const other = row({ mal_id: 1, title: "Other" });

    const rows = mergeAll([mal, null, other, mal], [anilist]);

    expect(rows.map((r) => r.mal_id).sort()).toEqual([1, 52991]);
    expect(rows.find((r) => r.mal_id === 52991)!.banner_url).toBe("https://s4.anilist.co/banner.jpg");
  });
});

describe("charts", () => {
  it("publishes MAL's chart when MAL answered, AniList's when it didn't", () => {
    const lists = pickLists(
      { airing: [row({ mal_id: 1 }), row({ mal_id: 2 })] },
      { airing: [row({ mal_id: 9 })], popular: [row({ mal_id: 3 })] },
    );

    expect(lists).toEqual([
      { key: "airing", mal_ids: [1, 2], source: "mal" },
      { key: "popular", mal_ids: [3], source: "anilist" },
    ]);
  });

  it("publishes nothing for a chart neither engine filled — the old snapshot ages out instead", () => {
    // MAL's degraded mode answers 200 with no rows; that must not blank a rail.
    expect(pickLists({ airing: [] }, { airing: [null, null] })).toEqual([]);
  });

  it("keeps chart order, dedupes, and caps at the key's size", () => {
    const rows = Array.from({ length: 80 }, (_, i) => row({ mal_id: (i % 60) + 1 }));

    const ids = chartIds(rows, LIST_CAP.airing);

    expect(ids).toHaveLength(50);
    expect(ids.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("re-ranks the Top 10 windows by viewers and derives the monthly one from this season", () => {
    const season = [row({ mal_id: 1, members: 10 }), row({ mal_id: 2, members: 30 }), row({ mal_id: 3, members: 20 })];
    const lists = jikanLists([
      { chart: { key: "season-now", path: "/seasons/now?sfw=true", pages: 2 }, rows: season },
      {
        chart: { key: "top10-weekly", path: "/anime?status=airing", pages: 1 },
        rows: [row({ mal_id: 4, members: 1 }), row({ mal_id: 5, members: 9 })],
      },
    ]);

    // The season chart itself keeps MAL's order…
    expect(chartIds(lists["season-now"]!, 50)).toEqual([1, 2, 3]);
    // …its Top 10 view is by viewers.
    expect(chartIds(lists["top10-monthly"]!, 25)).toEqual([2, 3, 1]);
    expect(chartIds(lists["top10-weekly"]!, 25)).toEqual([5, 4]);
  });

  it("keeps only slotted shows on the schedule", () => {
    const lists = jikanLists([
      {
        chart: { key: "schedule", path: "/schedules", pages: 8 },
        rows: [row({ mal_id: 1 }), row({ mal_id: 2, broadcast_day: null }), null],
      },
    ]);

    expect(chartIds(lists.schedule!, 200)).toEqual([1]);
  });

  it("fans AniList's RELEASING pages out to airing, the weekly Top 10 and the schedule", () => {
    const releasing = anilistCharts(new Date("2026-10-19T00:00:00Z")).filter((c) => c.key === "schedule");
    const lists = anilistLists([
      { chart: releasing[1]!, rows: [row({ mal_id: 3, members: 5 })] },
      { chart: releasing[0]!, rows: [row({ mal_id: 1, members: 1 }), row({ mal_id: 2, members: 9, broadcast_day: null })] },
    ]);

    // Page 1 alone is the airing chart, whatever order pages arrive in.
    expect(chartIds(lists.airing!, 50)).toEqual([1, 2]);
    expect(chartIds(lists["top10-weekly"]!, 25)).toEqual([2, 1]);
    // Every page feeds the schedule, minus shows with no next episode.
    expect(chartIds(lists.schedule!, 200)).toEqual([1, 3]);
  });

  it("names the same chart keys the app reads", () => {
    expect([...LIST_KEYS]).toEqual([...CATALOG_LIST_KEYS]);
  });
});

describe("what the sync asks for", () => {
  const now = new Date("2026-10-19T06:23:00Z");

  it("asks Jikan for SFW charts only, within its rate budget", () => {
    const charts = jikanCharts(now);
    const requests = charts.reduce((n, c) => n + c.pages, 0);

    for (const c of charts) expect(c.path).toContain("sfw=true");
    // At ≥400ms apart that is ≤2.5/s, and under Jikan's 60/min in one run.
    expect(requests).toBeLessThanOrEqual(25);
    expect(charts.find((c) => c.key === "top10-yearly")!.path).toContain("start_date=2026-01-01");
  });

  it("asks AniList for non-adult media only, batched to stay far under 30 req/min", () => {
    const charts = anilistCharts(now);

    for (const c of charts) expect(c.args).toContain("isAdult: false");
    expect(Math.ceil(charts.length / ANILIST_PAGES_PER_REQUEST)).toBeLessThanOrEqual(3);
    expect(charts.find((c) => c.key === "season-now")!.args).toContain("season: FALL, seasonYear: 2026");
  });

  it("aliases each page of a batch so the answer maps back to its chart", () => {
    const doc = anilistDocument(anilistCharts(now).slice(0, ANILIST_PAGES_PER_REQUEST));

    expect(doc.match(/p\d+: Page\(/g)).toEqual(["p0: Page(", "p1: Page(", "p2: Page(", "p3: Page("]);
    expect(doc).toContain("nextAiringEpisode { airingAt }");
  });
});

describe("rows fit the database's enums", () => {
  // Compile-time: a mapper value outside the 0001 enums is a type error here,
  // because database.types.ts is the hand-kept mirror of those enums.
  it("types every enum column against database.types", () => {
    const r = fromJikan(jikanRecord())!;
    const status: Enums<"airing_status"> | null = r.status;
    const type: Enums<"anime_type"> | null = r.type;
    const rating: Enums<"content_rating"> | null = r.rating;
    const season: Enums<"anime_season"> | null = r.season;

    expect([status, type, rating, season]).toEqual(["finished_airing", "tv", "pg_13", "fall"]);
  });
});
