import { beforeEach, describe, expect, it, vi } from "vitest";

import { mangaFixture } from "../helpers/fixtures";

/**
 * The manga search fallback chain: MAL (Jikan) → AniList → MangaDex → the
 * local catalog, plus the MangaDex enrichment pass that makes MAL-less titles
 * reachable.
 *
 * The enrichment tests below pin a bug that actually shipped: the Manhua tab
 * rendered 19 of 50 titles because the AniList fallback drops entries with no
 * MAL id (detail routes are mal_id-keyed) and 31 of the top Chinese titles have
 * no MAL entry. Nothing in a typecheck can see that; these tests can.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return { ...actual, searchManga: vi.fn(), searchAdultManga: vi.fn(), getMangaById: vi.fn() };
});
vi.mock("@/lib/anilist", () => ({
  searchAnilistManga: vi.fn(),
  searchAnilistAdultManga: vi.fn(),
  getAnilistMangaByMalId: vi.fn(),
}));
vi.mock("@/lib/mangadex", () => ({
  searchMangaDexManga: vi.fn(),
  searchMangaDexWebComics: vi.fn(),
}));
vi.mock("@/lib/manga-catalog-fallback", () => ({
  searchMangaCatalog: vi.fn(),
  searchAdultMangaCatalog: vi.fn(),
}));
// Server-only deps the action pulls in but these paths never exercise.
vi.mock("@/lib/manga", () => ({ addToMangaLibrary: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { searchManga, searchAdultManga } = await import("@/lib/jikan");
const { searchAnilistManga, searchAnilistAdultManga } = await import("@/lib/anilist");
const { searchMangaDexManga, searchMangaDexWebComics } = await import("@/lib/mangadex");
const { searchMangaCatalog, searchAdultMangaCatalog } = await import(
  "@/lib/manga-catalog-fallback"
);
const { searchMangaAction, searchWebComicsAction, searchAdultMangaAction } =
  await import("@/app/actions/manga");

const malMock = vi.mocked(searchManga);
const malAdultMock = vi.mocked(searchAdultManga);
const anilistMock = vi.mocked(searchAnilistManga);
const anilistAdultMock = vi.mocked(searchAnilistAdultManga);
const mangadexMock = vi.mocked(searchMangaDexManga);
const webComicsMock = vi.mocked(searchMangaDexWebComics);
const catalogMock = vi.mocked(searchMangaCatalog);
const adultCatalogMock = vi.mocked(searchAdultMangaCatalog);

/** A Jikan/AniList-shaped paginated payload. */
function malPage(list: ReturnType<typeof mangaFixture>[], lastPage = 1) {
  return {
    data: list,
    pagination: {
      last_visible_page: lastPage,
      has_next_page: lastPage > 1,
      current_page: 1,
      items: { count: list.length, total: list.length, per_page: 25 },
    },
  };
}

/** MangaDex's client returns its own `{ results, totalPages }` shape. */
function mdPage(list: ReturnType<typeof mangaFixture>[], totalPages = 1) {
  return { results: list, totalPages };
}

/** A title that exists on MangaDex but has no MAL entry. */
function mdOnly(id: string, title: string) {
  return mangaFixture({ mal_id: null, mangadex_id: id, title });
}

const fail = (msg: string) => Promise.reject(new Error(msg));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mangadexMock.mockResolvedValue(mdPage([]));
  catalogMock.mockResolvedValue([]);
});

describe("engine selection", () => {
  it("serves MAL results when MAL is healthy", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture({ title: "Berserk" })]));

    const res = await searchMangaAction("berserk");

    expect(res).toMatchObject({ ok: true, source: "mal", degraded: false });
  });

  it("falls back to AniList when MAL fails", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockResolvedValue(malPage([mangaFixture()]));

    const res = await searchMangaAction("berserk");

    expect(res).toMatchObject({ ok: true, source: "anilist", degraded: false });
  });

  it("falls back to MangaDex when MAL and AniList both fail", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
    mangadexMock.mockResolvedValue(mdPage([mangaFixture()], 3));

    const res = await searchMangaAction("berserk");

    expect(res).toMatchObject({ ok: true, source: "mangadex", totalPages: 3 });
  });

  it("falls back to the local catalog when every live engine fails", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
    mangadexMock.mockImplementation(() => fail("MangaDex down"));
    catalogMock.mockResolvedValue([mangaFixture()]);

    const res = await searchMangaAction("berserk");

    expect(res).toMatchObject({ ok: true, source: "catalog", degraded: true });
  });

  it("reports failure only when the catalog is down too", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
    mangadexMock.mockImplementation(() => fail("MangaDex down"));
    catalogMock.mockImplementation(() => fail("db down"));

    const res = await searchMangaAction("berserk");

    expect(res.ok).toBe(false);
  });

  it("skips MangaDex for genre-filtered queries it cannot express", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
    catalogMock.mockResolvedValue([mangaFixture()]);

    const res = await searchMangaAction("berserk", 1, undefined, [1]);

    expect(mangadexMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ source: "catalog" });
  });

  it("skips MangaDex for light novels, a format it cannot express", async () => {
    malMock.mockImplementation(() => fail("MAL 504"));
    anilistMock.mockImplementation(() => fail("AniList down"));
    catalogMock.mockResolvedValue([mangaFixture()]);

    const res = await searchMangaAction("spice", 1, "lightnovel");

    expect(mangadexMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ source: "catalog" });
  });
});

describe("MangaDex enrichment (the 19-of-50 manhua bug)", () => {
  it("adds MAL-less MangaDex titles the primary engine cannot return", async () => {
    // AniList can only return the 19 titles that have MAL ids…
    anilistMock.mockResolvedValue(malPage([mangaFixture({ mal_id: 1, title: "Has MAL" })]));
    malMock.mockImplementation(() => fail("MAL manga API down"));
    // …while MangaDex carries the ones that don't.
    mangadexMock.mockResolvedValue(
      mdPage([mdOnly("uuid-a", "No MAL A"), mdOnly("uuid-b", "No MAL B")]),
    );

    const res = await searchMangaAction("", 1, "manhua");

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results.map((m) => m.title)).toEqual(["Has MAL", "No MAL A", "No MAL B"]);
  });

  it("enriches a browse, not just a text search", async () => {
    // The Manhua tab browses with an empty query — the bug's actual trigger.
    malMock.mockResolvedValue(malPage([mangaFixture({ mal_id: 1 })]));
    mangadexMock.mockResolvedValue(mdPage([mdOnly("uuid-a", "No MAL A")]));

    const res = await searchMangaAction("", 1, "manhua");

    expect(mangadexMock).toHaveBeenCalled();
    expect(res.ok && res.results).toHaveLength(2);
  });

  it("keeps MAL-less titles addressable by their mangadex_id", async () => {
    // /manga/md/[id] is the only route that can link these.
    malMock.mockResolvedValue(malPage([]));
    mangadexMock.mockResolvedValue(mdPage([mdOnly("uuid-a", "No MAL A")]));

    const res = await searchMangaAction("", 1, "manhua");

    expect(res.ok && res.results[0]).toMatchObject({
      mal_id: null,
      mangadex_id: "uuid-a",
    });
  });

  it("does not enrich past page 1", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture()]));

    await searchMangaAction("", 2, "manhua");

    expect(mangadexMock).not.toHaveBeenCalled();
  });

  it("does not enrich a genre-filtered query", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture()]));

    await searchMangaAction("", 1, "manhua", [1]);

    expect(mangadexMock).not.toHaveBeenCalled();
  });

  it("keeps primary results when MangaDex enrichment fails", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture({ title: "Berserk" })]));
    mangadexMock.mockImplementation(() => fail("MangaDex down"));

    const res = await searchMangaAction("berserk");

    // Best-effort: enrichment failing must never break the search.
    expect(res).toMatchObject({ ok: true, source: "mal" });
    expect(res.ok && res.results).toHaveLength(1);
  });
});

describe("dedupe", () => {
  it("drops a MangaDex title already present by mal_id", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture({ mal_id: 2, title: "Berserk" })]));
    mangadexMock.mockResolvedValue(
      mdPage([mangaFixture({ mal_id: 2, mangadex_id: "uuid-b", title: "Berserk (MD)" })]),
    );

    const res = await searchMangaAction("berserk");

    expect(res.ok && res.results).toHaveLength(1);
    expect(res.ok && res.results[0].title).toBe("Berserk");
  });

  it("keeps two distinct MAL-less titles apart by mangadex_id", async () => {
    malMock.mockResolvedValue(malPage([]));
    mangadexMock.mockResolvedValue(mdPage([mdOnly("uuid-a", "A"), mdOnly("uuid-b", "B")]));

    const res = await searchMangaAction("");

    expect(res.ok && res.results).toHaveLength(2);
  });

  it("collapses duplicate MAL-less titles sharing a mangadex_id", async () => {
    malMock.mockResolvedValue(malPage([]));
    mangadexMock.mockResolvedValue(mdPage([mdOnly("uuid-a", "A"), mdOnly("uuid-a", "A again")]));

    const res = await searchMangaAction("");

    expect(res.ok && res.results).toHaveLength(1);
  });

  it("drops an unaddressable entry with neither id", async () => {
    // No mal_id and no mangadex_id ⇒ no detail route can link it; rendering it
    // would produce a dead card.
    malMock.mockResolvedValue(
      malPage([mangaFixture({ mal_id: null, mangadex_id: null, title: "Ghost" })]),
    );

    const res = await searchMangaAction("ghost");

    expect(res.ok && res.results).toHaveLength(0);
  });

  it("dedupes within the primary engine's own results", async () => {
    malMock.mockResolvedValue(
      malPage([mangaFixture({ mal_id: 2 }), mangaFixture({ mal_id: 2 })]),
    );

    const res = await searchMangaAction("berserk");

    expect(res.ok && res.results).toHaveLength(1);
  });
});

describe("pagination", () => {
  it("never reports zero pages", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture()], 0));

    const res = await searchMangaAction("berserk");

    expect(res.ok && res.totalPages).toBe(1);
  });

  it("passes the requested page through to the engine", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture()], 5));

    await searchMangaAction("berserk", 3);

    expect(malMock.mock.calls[0][1]).toBe(3);
  });

  it("trims the query before searching", async () => {
    malMock.mockResolvedValue(malPage([mangaFixture()]));

    await searchMangaAction("  berserk  ");

    expect(malMock.mock.calls[0][0]).toBe("berserk");
  });
});

describe("webcomics", () => {
  it("serves MangaDex results", async () => {
    webComicsMock.mockResolvedValue(mdPage([mdOnly("uuid-a", "Web A")], 2));

    const res = await searchWebComicsAction("web");

    expect(res).toMatchObject({ ok: true, source: "mangadex", totalPages: 2 });
  });

  it("falls back to the catalog when MangaDex is down", async () => {
    webComicsMock.mockImplementation(() => fail("MangaDex down"));
    catalogMock.mockResolvedValue([mangaFixture()]);

    const res = await searchWebComicsAction("web");

    expect(res).toMatchObject({ ok: true, source: "catalog", degraded: true });
  });

  it("reports failure when MangaDex and the catalog are both down", async () => {
    webComicsMock.mockImplementation(() => fail("MangaDex down"));
    catalogMock.mockImplementation(() => fail("db down"));

    expect((await searchWebComicsAction("web")).ok).toBe(false);
  });
});

describe("adult search", () => {
  it("uses the MAL → AniList → catalog chain", async () => {
    malAdultMock.mockImplementation(() => fail("MAL down"));
    anilistAdultMock.mockResolvedValue(malPage([mangaFixture()]));

    const res = await searchAdultMangaAction("x");

    expect(res).toMatchObject({ ok: true, source: "anilist" });
  });

  it("never routes adult queries through MangaDex enrichment", async () => {
    // The adult chain is scoped to the hentai genre; MangaDex enrichment
    // can't express that, so leaking non-adult results in would be wrong.
    malAdultMock.mockResolvedValue(malPage([mangaFixture()]));

    await searchAdultMangaAction("x");

    expect(mangadexMock).not.toHaveBeenCalled();
  });

  it("degrades to the adult catalog, not the general one", async () => {
    malAdultMock.mockImplementation(() => fail("MAL down"));
    anilistAdultMock.mockImplementation(() => fail("AniList down"));
    adultCatalogMock.mockResolvedValue([mangaFixture()]);

    const res = await searchAdultMangaAction("x");

    expect(res).toMatchObject({ ok: true, source: "catalog", degraded: true });
    expect(catalogMock).not.toHaveBeenCalled();
  });
});
