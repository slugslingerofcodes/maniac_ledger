import { beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * The posters tab's fallback chain: MAL (poster galleries) → AniList (covers)
 * → the local catalog (covers).
 *
 * Every branch below the first only runs while MAL is down — the same
 * impossible-to-exercise-by-hand territory as the search chains, and the exact
 * failure the tab used to have: MAL down meant a dead tab with an error
 * message, even though two other engines could have filled the grid.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return {
    ...actual,
    searchAnime: vi.fn(),
    getTopAnime: vi.fn(),
    getAnimePictures: vi.fn(),
  };
});
vi.mock("@/lib/anilist", () => ({ searchAnilist: vi.fn() }));
vi.mock("@/lib/catalog-fallback", () => ({
  searchCatalog: vi.fn(),
  browseCatalog: vi.fn(),
}));

const { searchAnime, getTopAnime, getAnimePictures } = await import("@/lib/jikan");
const { searchAnilist } = await import("@/lib/anilist");
const { searchCatalog, browseCatalog } = await import("@/lib/catalog-fallback");
const { fetchAnimePosters } = await import("@/app/actions/posters");

const searchMock = vi.mocked(searchAnime);
const topMock = vi.mocked(getTopAnime);
const picturesMock = vi.mocked(getAnimePictures);
const anilistMock = vi.mocked(searchAnilist);
const searchCatalogMock = vi.mocked(searchCatalog);
const browseCatalogMock = vi.mocked(browseCatalog);

function page(titles: string[]) {
  return {
    data: titles.map((title, i) => animeFixture({ title, mal_id: 100 + i })),
    pagination: paginationFixture(),
  };
}

function pictures(urls: string[]) {
  return {
    data: urls.map((u) => ({
      jpg: { image_url: u, small_image_url: u, large_image_url: u },
    })),
  };
}

const fail = (msg: string) => Promise.reject(new Error(msg));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  picturesMock.mockResolvedValue(pictures(["https://cdn.example/a.jpg"]));
});

describe("MAL primary", () => {
  it("flattens each title's poster gallery", async () => {
    searchMock.mockResolvedValue(page(["Frieren"]));
    picturesMock.mockResolvedValue(
      pictures(["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"]),
    );

    const res = await fetchAnimePosters("frieren");

    expect(res).toMatchObject({ ok: true, source: "mal", degraded: false });
    expect(res.ok && res.posters).toHaveLength(2);
  });

  it("browses top titles for an empty query", async () => {
    topMock.mockResolvedValue(page(["A", "B"]));

    const res = await fetchAnimePosters("");

    expect(topMock).toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it("keeps other titles when one gallery fetch fails, marked degraded", async () => {
    searchMock.mockResolvedValue(page(["A", "B"]));
    picturesMock
      .mockResolvedValueOnce(pictures(["https://cdn.example/a.jpg"]))
      .mockRejectedValueOnce(new Error("504"));

    const res = await fetchAnimePosters("x");

    expect(res).toMatchObject({ ok: true, source: "mal", degraded: true });
    // The failed title falls back to its main cover rather than vanishing.
    expect(res.ok && res.posters.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AniList fallback", () => {
  it("serves covers from AniList when MAL is down", async () => {
    searchMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockResolvedValue(page(["Frieren"]));

    const res = await fetchAnimePosters("frieren");

    expect(res).toMatchObject({ ok: true, source: "anilist", degraded: true });
    expect(res.ok && res.posters[0].url).toContain("poster-l.jpg");
    // Never asks MAL for galleries it can't reach.
    expect(picturesMock).not.toHaveBeenCalled();
  });

  it("browses AniList by popularity for an empty query", async () => {
    topMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockResolvedValue(page(["A"]));

    const res = await fetchAnimePosters("");

    expect(anilistMock).toHaveBeenCalledWith({}, 1);
    expect(res.ok).toBe(true);
  });

  it("passes the text query through", async () => {
    searchMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockResolvedValue(page(["A"]));

    await fetchAnimePosters("frieren");

    expect(anilistMock).toHaveBeenCalledWith({ query: "frieren" }, 1);
  });
});

describe("catalog fallback", () => {
  beforeEach(() => {
    searchMock.mockImplementation(() => fail("MAL 504"));
    topMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
  });

  it("serves covers from the catalog when both live engines are down", async () => {
    searchCatalogMock.mockResolvedValue([animeFixture({ title: "Frieren" })]);

    const res = await fetchAnimePosters("frieren");

    expect(res).toMatchObject({ ok: true, source: "catalog", degraded: true });
    expect(res.ok && res.posters).toHaveLength(1);
  });

  it("browses best-scored catalog rows for an empty query", async () => {
    browseCatalogMock.mockResolvedValue([animeFixture()]);

    const res = await fetchAnimePosters("");

    expect(browseCatalogMock).toHaveBeenCalled();
    expect(searchCatalogMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it("reports failure when the catalog is empty", async () => {
    // An empty catalog can't fill the grid — that's an honest error, not a
    // silent blank page.
    searchCatalogMock.mockResolvedValue([]);

    const res = await fetchAnimePosters("frieren");

    expect(res.ok).toBe(false);
  });

  it("reports failure when the catalog is down too", async () => {
    searchCatalogMock.mockImplementation(() => fail("db down"));

    const res = await fetchAnimePosters("frieren");

    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("MyAnimeList may be down");
  });
});
