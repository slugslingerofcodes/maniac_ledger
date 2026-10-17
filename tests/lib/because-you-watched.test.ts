import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowseItem } from "@/lib/browse-item";
import type { LibrarySnapshotRow } from "@/lib/library-snapshot";
import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * "Because you watched X": which library title anchors the row, and which
 * titles fill it.
 *
 * Every rule here exists because breaking it produces a row that *looks* fine
 * and is wrong — anchored on a show the viewer dropped or rated 3/10, padded
 * with the sequel of the show it's named after, or full of titles already in
 * the library. None of that throws, so none of it shows up anywhere but here.
 */

vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return { ...actual, searchAnilist: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { searchAnilist } = await import("@/lib/anilist");
const { createClient } = await import("@/lib/supabase/server");
const {
  ANILIST_WAIT_MS,
  anilistGenreIds,
  getBecauseYouWatched,
  isSameSeries,
  pickSeed,
  rankSimilar,
  seriesKey,
} = await import("@/lib/because-you-watched");

function lib(overrides: Partial<LibrarySnapshotRow> = {}): LibrarySnapshotRow {
  return {
    animeId: "uuid-1",
    malId: 52991,
    title: "Sousou no Frieren",
    titleEnglish: "Frieren: Beyond Journey's End",
    posterUrl: null,
    type: "tv",
    totalEpisodes: 28,
    airing: "finished_airing",
    genres: ["Adventure", "Drama", "Fantasy"],
    franchiseId: null,
    status: "completed",
    score: 9,
    episodesWatched: 28,
    lastWatchedAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function item(malId: number, genres: string[], overrides: Partial<BrowseItem> = {}): BrowseItem {
  return {
    malId,
    title: `Show n${malId}`,
    titleEnglish: null,
    posterUrl: null,
    type: "TV",
    year: 2024,
    episodes: 12,
    score: 8,
    synopsis: null,
    genres,
    studio: null,
    airingStatus: "Finished Airing",
    season: null,
    ...overrides,
  };
}

describe("pickSeed", () => {
  it("anchors on the most recently watched title", () => {
    const seed = pickSeed([
      lib({ malId: 1, title: "Older", lastWatchedAt: "2026-09-01T00:00:00Z" }),
      lib({ malId: 2, title: "Newer", lastWatchedAt: "2026-10-10T00:00:00Z" }),
    ]);
    expect(seed?.malId).toBe(2);
  });

  it("falls back to updated_at when a title has no watch timestamp", () => {
    const seed = pickSeed([
      lib({ malId: 1, lastWatchedAt: "2026-09-01T00:00:00Z" }),
      lib({ malId: 2, lastWatchedAt: null, updatedAt: "2026-10-12T00:00:00Z" }),
    ]);
    expect(seed?.malId).toBe(2);
  });

  it("only counts titles actually watched: not planned, not dropped", () => {
    const recent = "2026-10-15T00:00:00Z";
    const seed = pickSeed([
      lib({ malId: 1, status: "plan_to_watch", episodesWatched: 0, lastWatchedAt: recent }),
      lib({ malId: 2, status: "dropped", lastWatchedAt: recent }),
      lib({ malId: 3, status: "on_hold", episodesWatched: 0, lastWatchedAt: recent }),
      lib({ malId: 4, status: "watching", lastWatchedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(seed?.malId).toBe(4);
  });

  it("counts an on-hold title once some of it was watched", () => {
    const seed = pickSeed([lib({ malId: 3, status: "on_hold", episodesWatched: 4 })]);
    expect(seed?.malId).toBe(3);
  });

  it("never anchors on a title the viewer rated poorly", () => {
    const seed = pickSeed([
      lib({ malId: 1, score: 4, lastWatchedAt: "2026-10-15T00:00:00Z" }),
      lib({ malId: 2, score: null, lastWatchedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(seed?.malId).toBe(2);
  });

  it("skips titles with no genres or no MAL id — nothing to match on", () => {
    const recent = "2026-10-15T00:00:00Z";
    const seed = pickSeed([
      lib({ malId: 1, genres: [], lastWatchedAt: recent }),
      lib({ malId: null, lastWatchedAt: recent }),
      lib({ malId: 3, lastWatchedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(seed?.malId).toBe(3);
  });

  it("breaks a tie on the viewer's own rating", () => {
    const at = "2026-10-01T00:00:00Z";
    const seed = pickSeed([
      lib({ malId: 1, score: 7, lastWatchedAt: at }),
      lib({ malId: 2, score: 10, lastWatchedAt: at }),
    ]);
    expect(seed?.malId).toBe(2);
  });

  it("returns null when nothing qualifies", () => {
    expect(pickSeed([])).toBeNull();
    expect(pickSeed([lib({ status: "plan_to_watch", episodesWatched: 0 })])).toBeNull();
  });
});

describe("isSameSeries", () => {
  it("recognises sequels, later cours and subtitled entries", () => {
    const frieren = { title: "Sousou no Frieren", titleEnglish: null };
    expect(isSameSeries(frieren, { title: "Sousou no Frieren 2nd Season", titleEnglish: null })).toBe(true);
    expect(
      isSameSeries(
        { title: "Shingeki no Kyojin", titleEnglish: "Attack on Titan" },
        { title: "Shingeki no Kyojin: The Final Season", titleEnglish: "Attack on Titan Final Season" },
      ),
    ).toBe(true);
  });

  it("matches across languages when either title lines up", () => {
    expect(
      isSameSeries(
        { title: "Kimetsu no Yaiba", titleEnglish: "Demon Slayer" },
        { title: "Kimetsu no Yaiba: Yuukaku-hen", titleEnglish: "Demon Slayer: Entertainment District Arc" },
      ),
    ).toBe(true);
  });

  it("needs a whole-word prefix, so unrelated shows don't collide", () => {
    expect(
      isSameSeries(
        { title: "Mob Psycho 100", titleEnglish: null },
        { title: "Mobile Suit Gundam", titleEnglish: null },
      ),
    ).toBe(false);
    expect(
      isSameSeries(
        { title: "Frieren", titleEnglish: null },
        { title: "Fullmetal Alchemist", titleEnglish: null },
      ),
    ).toBe(false);
  });

  it("strips season markers to a series key", () => {
    expect(seriesKey("Sousou no Frieren 2nd Season")).toBe("sousou no frieren");
    expect(seriesKey("Spy x Family Season 2")).toBe("spy x family");
  });
});

describe("rankSimilar", () => {
  const seed = { title: "Sousou no Frieren", titleEnglish: null, genres: ["Adventure", "Drama", "Fantasy"] };

  it("leaves out the library, the franchise and the seed's own series", () => {
    const ranked = rankSimilar(
      seed,
      [
        item(1, ["Adventure", "Fantasy"]),
        item(2, ["Adventure", "Fantasy"]),
        item(3, ["Adventure", "Fantasy"], { title: "Sousou no Frieren 2nd Season" }),
      ],
      new Set([2]),
    );
    expect(ranked.map((r) => r.malId)).toEqual([1]);
  });

  it("requires two shared genres — one shared 'Drama' isn't a reason", () => {
    const ranked = rankSimilar(
      seed,
      [item(1, ["Drama", "Romance"]), item(2, ["Drama", "Fantasy", "Romance"])],
      new Set(),
    );
    expect(ranked.map((r) => r.malId)).toEqual([2]);
  });

  it("accepts one shared genre when the seed only has one", () => {
    const ranked = rankSimilar(
      { title: "Seed", titleEnglish: null, genres: ["Sports"] },
      [item(1, ["Sports", "Comedy"])],
      new Set(),
    );
    expect(ranked.map((r) => r.malId)).toEqual([1]);
  });

  it("ranks by genre overlap first, then score", () => {
    const ranked = rankSimilar(
      seed,
      [
        item(1, ["Adventure", "Fantasy"], { score: 9.1 }),
        item(2, ["Adventure", "Drama", "Fantasy"], { score: 7.5 }),
        item(3, ["Adventure", "Drama"], { score: 8.4 }),
      ],
      new Set(),
    );
    expect(ranked.map((r) => r.malId)).toEqual([2, 1, 3]);
  });

  it("treats AniList's Thriller and MAL's Suspense as one genre", () => {
    const ranked = rankSimilar(
      { title: "Seed", titleEnglish: null, genres: ["Suspense", "Mystery"] },
      [item(1, ["Thriller", "Mystery"])],
      new Set(),
    );
    expect(ranked).toHaveLength(1);
  });

  it("keeps one title per series — the best-ranked one", () => {
    const ranked = rankSimilar(
      seed,
      [
        item(1, ["Adventure", "Fantasy"], { title: "Bleach: Sennen Kessen-hen", score: 9 }),
        item(2, ["Adventure", "Fantasy"], { title: "Bleach: Sennen Kessen-hen - Ketsubetsu-tan", score: 8.9 }),
        item(3, ["Adventure", "Fantasy"], { title: "Mushishi", score: 8.7 }),
      ],
      new Set(),
    );
    expect(ranked.map((r) => r.malId)).toEqual([1, 3]);
  });

  it("dedupes a title that came from both sources, keeping the first", () => {
    const ranked = rankSimilar(
      seed,
      [item(1, ["Adventure", "Fantasy"], { score: 9 }), item(1, ["Adventure", "Fantasy"], { score: 1 })],
      new Set(),
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.score).toBe(9);
  });
});

describe("anilistGenreIds", () => {
  it("maps seed genre names to MAL ids AniList can filter as genres", () => {
    // Adventure 2, Drama 8, Fantasy 10 — and "Award Winning" isn't ours.
    expect(anilistGenreIds(["Adventure", "Drama", "Fantasy", "Award Winning"])).toEqual([2, 8, 10]);
  });

  it("drops MAL themes AniList only knows as tags", () => {
    expect(anilistGenreIds(["School", "Isekai"])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* getBecauseYouWatched — the sources around the pure steps                   */
/* -------------------------------------------------------------------------- */

type CatalogRow = Record<string, unknown>;

/**
 * A Supabase stand-in that answers the two `anime` reads this module makes:
 * the genre-overlap candidate query, and the franchise lookup (`select("mal_id")`).
 */
function catalogClient(candidates: CatalogRow[], franchise: number[] = []) {
  const reads: string[] = [];
  return {
    reads,
    client: {
      from: vi.fn(() => {
        let columns = "";
        const builder: Record<string, unknown> = {
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: columns === "mal_id" ? franchise.map((mal_id) => ({ mal_id })) : candidates,
              error: null,
            }).then(resolve),
        };
        for (const m of ["not", "overlaps", "order", "limit", "eq"]) builder[m] = () => builder;
        builder.select = (cols: string) => {
          columns = cols;
          reads.push(cols);
          return builder;
        };
        return builder;
      }),
    },
  };
}

function catalogRow(mal_id: number, genres: string[], extra: CatalogRow = {}): CatalogRow {
  return {
    mal_id,
    title: `Catalog n${mal_id}`,
    title_english: null,
    poster_url: null,
    type: "tv",
    year: 2020,
    total_episodes: 12,
    score: 8,
    synopsis: null,
    genres,
    studio: null,
    status: "finished_airing",
    season: null,
    ...extra,
  };
}

const FANTASY = ["Adventure", "Fantasy"];

describe("getBecauseYouWatched", () => {
  beforeEach(() => {
    vi.mocked(searchAnilist).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges catalog and AniList picks, minus the library and the franchise", async () => {
    const { client } = catalogClient(
      [catalogRow(10, FANTASY), catalogRow(11, FANTASY), catalogRow(12, FANTASY), catalogRow(99, FANTASY)],
      [12],
    );
    vi.mocked(createClient).mockResolvedValue(client as never);
    const genres = FANTASY.map((name) => ({ mal_id: 0, type: "genre", name, url: "" }));
    vi.mocked(searchAnilist).mockResolvedValue({
      data: [
        animeFixture({ mal_id: 20, title: "Made in Abyss", title_english: null, genres }),
        animeFixture({ mal_id: 21, title: "Mushishi", title_english: null, genres }),
      ],
      pagination: paginationFixture(),
    });

    const library = [
      lib({ franchiseId: "f-1" }),
      lib({
        malId: 99,
        title: "In library",
        lastWatchedAt: null,
        updatedAt: "2020-01-01T00:00:00Z",
      }),
    ];
    const result = await getBecauseYouWatched(library);

    expect(result?.seed.malId).toBe(52991);
    const ids = result!.items.map((i) => i.malId).sort((a, b) => a - b);
    expect(ids).toEqual([10, 11, 20, 21]);
  });

  it("still fills the row from the catalog when AniList fails", async () => {
    const { client } = catalogClient([10, 11, 12, 13].map((id) => catalogRow(id, FANTASY)));
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(searchAnilist).mockRejectedValue(new Error("403 disabled"));

    const result = await getBecauseYouWatched([lib()]);
    expect(result?.items).toHaveLength(4);
  });

  it("doesn't wait on a slow AniList past its budget", async () => {
    vi.useFakeTimers();
    const { client } = catalogClient([10, 11, 12, 13].map((id) => catalogRow(id, FANTASY)));
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(searchAnilist).mockReturnValue(new Promise(() => {}));

    const pending = getBecauseYouWatched([lib()]);
    await vi.advanceTimersByTimeAsync(ANILIST_WAIT_MS);
    const result = await pending;
    expect(result?.items.map((i) => i.malId)).toEqual([10, 11, 12, 13]);
  });

  it("renders nothing rather than a stub row", async () => {
    const { client } = catalogClient([catalogRow(10, FANTASY)]);
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(searchAnilist).mockResolvedValue({ data: [], pagination: paginationFixture() });

    expect(await getBecauseYouWatched([lib()])).toBeNull();
  });

  it("never asks the catalog for adult titles", async () => {
    const { client, reads } = catalogClient([]);
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(searchAnilist).mockResolvedValue({ data: [], pagination: paginationFixture() });
    const notSpy = vi.fn();
    client.from.mockImplementationOnce(() => {
      const b: Record<string, unknown> = {
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
      };
      for (const m of ["overlaps", "order", "limit", "eq"]) b[m] = () => b;
      b.select = (cols: string) => (reads.push(cols), b);
      b.not = (...args: unknown[]) => (notSpy(...args), b);
      return b;
    });

    await getBecauseYouWatched([lib()]);
    expect(notSpy).toHaveBeenCalledWith("genres", "cs", "{Hentai}");
  });

  it("returns null for a library with nothing to anchor on, without querying", async () => {
    const { client } = catalogClient([]);
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await getBecauseYouWatched([lib({ status: "plan_to_watch", episodesWatched: 0 })])).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
    expect(searchAnilist).not.toHaveBeenCalled();
  });
});
