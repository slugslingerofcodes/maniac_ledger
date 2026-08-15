import { beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * The home page's discovery rails: MAL (Jikan) → AniList → local catalog.
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

const {
  getSeasonNow,
  getTopByPopularity,
  getTopRated,
  getTopAnime,
  getUpcomingSeasons,
} = await import("@/lib/jikan");
const { searchAnilist, getAnilistUpcoming } = await import("@/lib/anilist");
const { browseCatalog } = await import("@/lib/catalog-fallback");
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
});

/**
 * The four rails that share a catalog tier behave identically, so they're
 * driven from one table rather than four near-identical describe blocks.
 */
const RAILS = [
  {
    name: "newest",
    run: () => getNewestAnime(5),
    primary: vi.mocked(getSeasonNow),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "popular",
    run: () => getPopularAnime(5),
    primary: vi.mocked(getTopByPopularity),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "top-rated",
    run: () => getTopRatedAnime(5),
    primary: vi.mocked(getTopRated),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
  {
    name: "top-airing",
    run: () => getTopAiringAnime(5),
    primary: vi.mocked(getTopAnime),
    primaryResolves: (data: ReturnType<typeof list>) => jikanPage(data),
  },
] as const;

describe.each(RAILS)("$name rail", ({ run, primary, primaryResolves }) => {
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

  it("never reaches the catalog — it cannot tell upcoming from finished", async () => {
    // The catalog stores no air-date status, so a rail captioned "Upcoming"
    // full of decade-old titles would be worse than an absent one. This rail
    // is deliberately allowed to disappear.
    vi.mocked(getUpcomingSeasons).mockRejectedValue(new Error("MAL down"));
    getAnilistUpcomingMock.mockRejectedValue(new Error("AniList down"));

    await expect(getUpcomingAnime(5)).resolves.toEqual([]);
    expect(browseCatalogMock).not.toHaveBeenCalled();
  });
});
