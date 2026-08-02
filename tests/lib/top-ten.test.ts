import { beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * The Top 10 fallback chain: MAL (Jikan) → AniList → the local catalog.
 *
 * The chart shipped for months with no chain at all, and failed in the one way
 * nothing catches: MAL's degraded mode answers `200 {"data": []}` rather than
 * erroring, so no exception was thrown, the last-good cache never engaged, and
 * an empty array reached the UI as though it were the real chart. These tests
 * pin **empty-is-a-failure** at every tier, because that is the branch a future
 * refactor is most likely to drop — nothing about an empty array looks wrong.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return { ...actual, getTopTen: vi.fn() };
});
vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return { ...actual, searchAnilist: vi.fn() };
});
vi.mock("@/lib/catalog-fallback", () => ({ browseCatalog: vi.fn() }));

const { getTopTen } = await import("@/lib/jikan");
const { searchAnilist } = await import("@/lib/anilist");
const { browseCatalog } = await import("@/lib/catalog-fallback");
const { getTopTenChart } = await import("@/lib/top-ten");

const getTopTenMock = vi.mocked(getTopTen);
const searchAnilistMock = vi.mocked(searchAnilist);
const browseCatalogMock = vi.mocked(browseCatalog);

/** `n` distinct titles, descending in members so ranking is observable. */
function chart(prefix: string, n: number, base = 1000) {
  return Array.from({ length: n }, (_, i) =>
    animeFixture({
      mal_id: base + i,
      title: `${prefix} ${i}`,
      members: 1_000_000 - i * 1000,
    }),
  );
}

function anilistPage(list: ReturnType<typeof chart>) {
  return { data: list, pagination: paginationFixture() };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Silence the chain's deliberate console noise; assertions cover behaviour.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getTopTenChart", () => {
  it("serves MAL when it answers, without touching the backups", async () => {
    getTopTenMock.mockResolvedValue(chart("mal", 10));

    const res = await getTopTenChart("weekly");

    expect(res).toHaveLength(10);
    expect(res[0]!.title).toBe("mal 0");
    expect(searchAnilistMock).not.toHaveBeenCalled();
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });

  it("falls through to AniList when MAL throws", async () => {
    getTopTenMock.mockRejectedValue(new Error("MAL unreachable"));
    searchAnilistMock.mockResolvedValue(anilistPage(chart("anilist", 10, 2000)));

    const res = await getTopTenChart("weekly");

    expect(res[0]!.title).toBe("anilist 0");
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });

  it("falls through to AniList when MAL succeeds but returns nothing", async () => {
    // The real-world failure: a 200 with an empty list. Nothing throws, so only
    // an explicit emptiness check moves the chain along.
    getTopTenMock.mockResolvedValue([]);
    searchAnilistMock.mockResolvedValue(anilistPage(chart("anilist", 10, 2000)));

    const res = await getTopTenChart("monthly");

    expect(res).toHaveLength(10);
    expect(res[0]!.title).toBe("anilist 0");
  });

  it("falls through to the catalog when AniList is also empty", async () => {
    getTopTenMock.mockResolvedValue([]);
    searchAnilistMock.mockResolvedValue(anilistPage([]));
    browseCatalogMock.mockResolvedValue(chart("catalog", 10, 3000));

    const res = await getTopTenChart("yearly");

    expect(res[0]!.title).toBe("catalog 0");
    expect(browseCatalogMock).toHaveBeenCalled();
  });

  it("returns an empty chart, rather than throwing, when every tier is down", async () => {
    // The chart is one section of a busy page: a dead upstream must cost that
    // section, never the whole render.
    getTopTenMock.mockRejectedValue(new Error("MAL down"));
    searchAnilistMock.mockRejectedValue(new Error("AniList down"));
    browseCatalogMock.mockRejectedValue(new Error("DB down"));

    await expect(getTopTenChart("weekly")).resolves.toEqual([]);
  });

  it("caps the chart at ten and ranks by viewer count", async () => {
    getTopTenMock.mockResolvedValue([
      animeFixture({ mal_id: 1, title: "quiet", members: 10 }),
      animeFixture({ mal_id: 2, title: "huge", members: 900 }),
      ...chart("filler", 20, 5000),
    ]);

    const res = await getTopTenChart("weekly");

    expect(res).toHaveLength(10);
    expect(res[0]!.title).toBe("filler 0"); // 1,000,000 members
    expect(res.map((a) => a.title)).not.toContain("quiet");
  });

  it("drops duplicate ids so a repeated title can't eat two chart slots", async () => {
    getTopTenMock.mockResolvedValue([
      animeFixture({ mal_id: 7, title: "dup", members: 500 }),
      animeFixture({ mal_id: 7, title: "dup again", members: 400 }),
      ...chart("rest", 3, 8000),
    ]);

    const res = await getTopTenChart("weekly");

    expect(res.filter((a) => a.mal_id === 7)).toHaveLength(1);
  });

  it("asks each window for the filters that make the tabs differ", async () => {
    getTopTenMock.mockResolvedValue([]);
    searchAnilistMock.mockResolvedValue(anilistPage(chart("a", 1)));

    await getTopTenChart("weekly");
    expect(searchAnilistMock).toHaveBeenCalledWith({ status: "airing" }, 1);

    searchAnilistMock.mockClear();
    await getTopTenChart("yearly");
    const year = new Date().getFullYear();
    expect(searchAnilistMock).toHaveBeenCalledWith(
      { minYear: year, maxYear: year },
      1,
    );

    searchAnilistMock.mockClear();
    await getTopTenChart("monthly");
    const [filters] = searchAnilistMock.mock.calls[0]!;
    expect(filters).toMatchObject({ year });
    expect(["winter", "spring", "summer", "fall"]).toContain(filters.season);
  });
});
