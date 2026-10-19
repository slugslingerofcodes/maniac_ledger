import { beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * The home page's discovery rails: the catalog-sync snapshot → MAL (Jikan) →
 * AniList → the snapshot again at any age → the catalog's best-scored rows.
 *
 * These rails shipped as `getX().catch(() => [])` with nothing after the catch,
 * so an upstream outage blanked the three biggest tabs on the landing page
 * while the smaller rails beside them — which *did* have AniList fallbacks —
 * kept working. The asymmetry is what made it read as "the app is broken".
 *
 * As with the Top 10 chain, the branch most likely to be dropped by a future
 * refactor is **empty-is-a-failure**: MAL's degraded mode answers
 * `200 {"data": []}` rather than erroring, so nothing throws and an empty array
 * looks entirely normal on the way to the UI. Every rail pins that here.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return {
    ...actual,
    getSeasonNow: vi.fn(),
    getTopByPopularity: vi.fn(),
    getTopRated: vi.fn(),
    getTopAnime: vi.fn(),
    getUpcomingSeasons: vi.fn(),
  };
});
vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return {
    ...actual,
    searchAnilist: vi.fn(),
    getAnilistUpcoming: vi.fn(),
  };
});
vi.mock("@/lib/catalog-fallback", () => ({ browseCatalog: vi.fn() }));
vi.mock("@/lib/catalog", () => ({
  getCatalogList: vi.fn(),
  getStaleCatalogList: vi.fn(),
}));

const {
  getSeasonNow,
  getTopByPopularity,
  getTopRated,
  getTopAnime,
  getUpcomingSeasons,
} = await import("@/lib/jikan");
const { searchAnilist, getAnilistUpcoming } = await import("@/lib/anilist");
const { browseCatalog } = await import("@/lib/catalog-fallback");
const { getCatalogList, getStaleCatalogList } = await import("@/lib/catalog");
const {
  getNewestAnime,
  getPopularAnime,
  getTopRatedAnime,
  getTopAiringAnime,
  getUpcomingAnime,
} = await import("@/lib/discovery");

const searchAnilistMock = vi.mocked(searchAnilist);
const browseCatalogMock = vi.mocked(browseCatalog);
const getAnilistUpcomingMock = vi.mocked(getAnilistUpcoming);
const getCatalogListMock = vi.mocked(getCatalogList);
const getStaleCatalogListMock = vi.mocked(getStaleCatalogList);

function list(prefix: string, n: number, base = 1000) {
  return Array.from({ length: n }, (_, i) =>
    animeFixture({ mal_id: base + i, title: `${prefix} ${i}` }),
  );
}

function jikanPage(data: ReturnType<typeof list>) {
  return { data, pagination: paginationFixture() };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Silence the chain's deliberate console noise; assertions cover behaviour.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Default: no snapshot (the sync hasn't run), so the live chain is exercised.
  getCatalogListMock.mockResolvedValue([]);
  getStaleCatalogListMock.mockResolvedValue([]);
});

/**
 * The four rails that share a catalog tier behave identically, so they're
 * driven from one table rather than four near-identical describe blocks.
 */
const RAILS = [
  {
    name: "newest",
    key: "season-now",
    run: () => getNewestAnime(5),
    primary: vi.mocked(getSeasonNow),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "popular",
    key: "popular",
    run: () => getPopularAnime(5),
    primary: vi.mocked(getTopByPopularity),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "top-rated",
    key: "top-rated",
    run: () => getTopRatedAnime(5),
    primary: vi.mocked(getTopRated),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "top-airing",
    key: "airing",
    run: () => getTopAiringAnime(5),
    primary: vi.mocked(getTopAnime),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
] as const;

describe.each(RAILS)("$name rail", ({ key, run, primary, primaryResolves }) => {
  it("serves a fresh catalog snapshot without asking MAL or AniList", async () => {
    getCatalogListMock.mockResolvedValue(list("synced", 5, 4000));

    const res = await run();

    expect(res[0]!.title).toBe("synced 0");
    expect(getCatalogListMock).toHaveBeenCalledWith(key, expect.any(Number));
    expect(primary).not.toHaveBeenCalled();
    expect(searchAnilistMock).not.toHaveBeenCalled();
  });

  it("asks the live engines only when there is no fresh snapshot", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary.mockResolvedValue(primaryResolves(list("mal", 5)) as any);

    const res = await run();

    expect(getCatalogListMock).toHaveBeenCalledTimes(1);
    expect(res[0]!.title).toBe("mal 0");
    // A live answer means the old snapshot is never consulted.
    expect(getStaleCatalogListMock).not.toHaveBeenCalled();
  });

  it("prefers an old snapshot to the best-scored list when both live engines fail", async () => {
    primary.mockRejectedValue(new Error("MAL down"));
    searchAnilistMock.mockRejectedValue(new Error("AniList down"));
    getStaleCatalogListMock.mockResolvedValue(list("old chart", 5, 5000));
    browseCatalogMock.mockResolvedValue(list("best-scored", 5, 3000));

    const res = await run();

    expect(res[0]!.title).toBe("old chart 0");
    expect(getStaleCatalogListMock).toHaveBeenCalledWith(key, expect.any(Number));
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });

  it("serves MAL when it answers, without touching the backups", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary.mockResolvedValue(primaryResolves(list("mal", 5)) as any);

    const res = await run();

    expect(res[0]!.title).toBe("mal 0");
    expect(searchAnilistMock).not.toHaveBeenCalled();
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });

  it("falls through to AniList when MAL throws", async () => {
    primary.mockRejectedValue(new Error("MAL unreachable"));
    searchAnilistMock.mockResolvedValue({
      data: list("anilist", 5, 2000),
      pagination: paginationFixture(),
    });

    const res = await run();

    expect(res[0]!.title).toBe("anilist 0");
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });

  it("falls through to AniList when MAL returns 200 with an empty list", async () => {
    // The real-world failure mode: nothing throws, so only an explicit
    // emptiness check moves the chain along.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary.mockResolvedValue(primaryResolves([]) as any);
    searchAnilistMock.mockResolvedValue({
      data: list("anilist", 5, 2000),
      pagination: paginationFixture(),
    });

    const res = await run();

    expect(res[0]!.title).toBe("anilist 0");
  });

  it("falls through to the catalog when AniList is empty too", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary.mockResolvedValue(primaryResolves([]) as any);
    searchAnilistMock.mockResolvedValue({
      data: [],
      pagination: paginationFixture(),
    });
    browseCatalogMock.mockResolvedValue(list("catalog", 5, 3000));

    const res = await run();

    expect(res[0]!.title).toBe("catalog 0");
  });

  it("returns [] rather than throwing when every tier is down", async () => {
    // A rail is one section of a busy page: a dead upstream must cost that
    // section, never the whole render.
    primary.mockRejectedValue(new Error("MAL down"));
    searchAnilistMock.mockRejectedValue(new Error("AniList down"));
    browseCatalogMock.mockRejectedValue(new Error("DB down"));

    await expect(run()).resolves.toEqual([]);
  });

  it("dedupes repeated mal_ids and caps at the requested limit", async () => {
    const dupes = [...list("dup", 3), ...list("dup", 3), ...list("extra", 10, 9000)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary.mockResolvedValue(primaryResolves(dupes) as any);

    const res = await run();

    expect(res).toHaveLength(5);
    expect(new Set(res.map((a) => a.mal_id)).size).toBe(5);
  });
});

describe("upcoming rail", () => {
  it("falls through to AniList when MAL is empty", async () => {
    vi.mocked(getUpcomingSeasons).mockResolvedValue([]);
    getAnilistUpcomingMock.mockResolvedValue(list("anilist", 5, 2000));

    const res = await getUpcomingAnime(5);

    expect(res[0]!.title).toBe("anilist 0");
  });

  it("serves the synced upcoming chart first", async () => {
    getCatalogListMock.mockResolvedValue(list("synced", 5, 4000));

    const res = await getUpcomingAnime(5);

    expect(res[0]!.title).toBe("synced 0");
    expect(getCatalogListMock).toHaveBeenCalledWith("upcoming", expect.any(Number));
    expect(getUpcomingSeasons).not.toHaveBeenCalled();
  });

  it("never reaches the best-scored list — it cannot tell upcoming from finished", async () => {
    // The best-scored rows know nothing about air dates, so a rail captioned
    // "Upcoming" full of decade-old titles would be worse than an absent one.
    // Only the upcoming *snapshot* may stand in; without one the rail goes.
    vi.mocked(getUpcomingSeasons).mockRejectedValue(new Error("MAL down"));
    getAnilistUpcomingMock.mockRejectedValue(new Error("AniList down"));

    await expect(getUpcomingAnime(5)).resolves.toEqual([]);
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });
});
