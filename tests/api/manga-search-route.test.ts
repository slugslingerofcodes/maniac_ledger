import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mangaFixture, paginationFixture } from "../helpers/fixtures";

/**
 * GET /api/manga/search — the ⌘K palette's manga lookup, which replaced a
 * server-action call (actions run one at a time per client and can't be
 * aborted, so stale keystrokes queued, and blocked every other action).
 *
 * Its chain deliberately spends AniList last: MAL, hedged by MangaDex →
 * AniList → the catalog. AniList's 30/min budget is the app's scarcest, and
 * when Jikan is down the anime half of the palette needs it on every keystroke.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return { ...actual, searchManga: vi.fn() };
});
vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return { ...actual, searchAnilistManga: vi.fn() };
});
vi.mock("@/lib/mangadex", () => ({ searchMangaDexManga: vi.fn() }));
vi.mock("@/lib/manga-catalog-fallback", () => ({ searchMangaCatalog: vi.fn() }));

const { searchManga, JikanError, JikanUnavailableError } = await import("@/lib/jikan");
const { searchAnilistManga, AnilistError } = await import("@/lib/anilist");
const { searchMangaDexManga } = await import("@/lib/mangadex");
const { searchMangaCatalog } = await import("@/lib/manga-catalog-fallback");
const { resetRateLimit } = await import("@/lib/rate-limit");
const { GET } = await import("@/app/api/manga/search/route");

const malMock = vi.mocked(searchManga);
const anilistMock = vi.mocked(searchAnilistManga);
const mangadexMock = vi.mocked(searchMangaDexManga);
const catalogMock = vi.mocked(searchMangaCatalog);

function get(query: string) {
  return GET(new NextRequest(`https://app.test/api/manga/search?${query}`));
}

const malPage = (...titles: string[]) => ({
  data: titles.map((title, i) => mangaFixture({ title, mal_id: 100 + i })),
  pagination: paginationFixture(),
});
const mdResults = (...titles: string[]) => ({
  results: titles.map((title, i) =>
    mangaFixture({ title, mal_id: null, mangadex_id: `md-${i}` }),
  ),
  totalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetRateLimit();
});

describe("GET /api/manga/search", () => {
  it("serves MAL when it answers", async () => {
    malMock.mockResolvedValue(malPage("Berserk"));

    const res = await get("q=berserk&limit=4");
    const body = await res.json();

    expect(body).toMatchObject({ source: "mal", results: [{ title: "Berserk" }] });
    // Asks MAL for just the rows the palette shows.
    expect(malMock).toHaveBeenCalledWith("berserk", 1, [], undefined, 4);
    expect(mangadexMock).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("goes straight to MangaDex when MAL is down — not AniList", async () => {
    malMock.mockRejectedValue(new JikanUnavailableError("circuit open"));
    mangadexMock.mockResolvedValue(mdResults("Vagabond"));

    const body = await (await get("q=vagabond")).json();

    expect(body).toMatchObject({ source: "mangadex", results: [{ title: "Vagabond" }] });
    expect(anilistMock).not.toHaveBeenCalled();
  });

  it("falls back to AniList, with the request's signal, when MAL and MangaDex fail", async () => {
    malMock.mockRejectedValue(new JikanError(504, "down"));
    mangadexMock.mockRejectedValue(new Error("down"));
    anilistMock.mockResolvedValue(malPage("Monster"));

    const body = await (await get("q=monster")).json();

    expect(body.source).toBe("anilist");
    expect(anilistMock.mock.calls[0][4]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("serves the catalog, uncached and flagged degraded, when every engine fails", async () => {
    malMock.mockRejectedValue(new JikanError(504, "down"));
    mangadexMock.mockRejectedValue(new Error("down"));
    anilistMock.mockRejectedValue(new AnilistError(403, "disabled"));
    catalogMock.mockResolvedValue([mangaFixture({ title: "Berserk" })]);

    const res = await get("q=berserk");
    const body = await res.json();

    expect(body).toMatchObject({ source: "catalog", degraded: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("503s honestly when even the catalog fails", async () => {
    malMock.mockRejectedValue(new JikanError(504, "down"));
    mangadexMock.mockRejectedValue(new Error("down"));
    anilistMock.mockRejectedValue(new AnilistError(500, "down"));
    catalogMock.mockRejectedValue(new Error("db down"));

    expect((await get("q=berserk")).status).toBe(503);
  });

  it("drops rows with no id to link to, and dedupes", async () => {
    malMock.mockResolvedValue({
      data: [
        mangaFixture({ mal_id: 2, title: "Berserk" }),
        mangaFixture({ mal_id: 2, title: "Berserk (dupe)" }),
        mangaFixture({ mal_id: null, mangadex_id: null, title: "Nowhere" }),
      ],
      pagination: paginationFixture(),
    });

    const body = await (await get("q=berserk")).json();

    expect(body.results.map((m: { title: string }) => m.title)).toEqual(["Berserk"]);
  });

  it("rejects a one-character query", async () => {
    expect((await get("q=b")).status).toBe(400);
    expect(malMock).not.toHaveBeenCalled();
  });

  describe("hedging", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("races MangaDex after 1.2s when MAL is slow", async () => {
      malMock.mockImplementation(() => new Promise(() => {}));
      mangadexMock.mockResolvedValue(mdResults("Vagabond"));

      const res = get("q=vagabond");
      await vi.advanceTimersByTimeAsync(1_199);
      expect(mangadexMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect((await (await res).json()).source).toBe("mangadex");
    });

    it("leaves MangaDex alone when MAL answers in time", async () => {
      malMock.mockImplementation(
        () => new Promise((r) => setTimeout(() => r(malPage("Berserk")), 800)),
      );

      const res = get("q=berserk");
      await vi.advanceTimersByTimeAsync(5_000);

      expect((await (await res).json()).source).toBe("mal");
      expect(mangadexMock).not.toHaveBeenCalled();
    });
  });
});
