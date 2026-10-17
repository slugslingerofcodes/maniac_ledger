import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture, paginationFixture } from "../helpers/fixtures";

/**
 * The anime search fallback chain: Jikan (MAL) → AniList → the local catalog.
 *
 * This is the app's most valuable behaviour and the least visible to a
 * typecheck — every branch here is an upstream *failure* path, so the only way
 * it gets exercised in production is during an outage. These tests make the
 * outage reproducible on demand.
 */

vi.mock("@/lib/jikan", async (importOriginal) => {
  // Keep the real JikanError: the route branches on `instanceof`.
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return { ...actual, searchAnime: vi.fn(), jikanRecentlyUnreachable: vi.fn(() => false) };
});
vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return { ...actual, searchAnilist: vi.fn() };
});
vi.mock("@/lib/catalog-fallback", () => ({ searchCatalog: vi.fn() }));

const { searchAnime, JikanError, jikanRecentlyUnreachable } = await import("@/lib/jikan");
const { searchAnilist, AnilistError } = await import("@/lib/anilist");
const { searchCatalog } = await import("@/lib/catalog-fallback");
const { resetRateLimit } = await import("@/lib/rate-limit");
const { GET } = await import("@/app/api/anime/search/route");

const searchAnimeMock = vi.mocked(searchAnime);
const searchAnilistMock = vi.mocked(searchAnilist);
const searchCatalogMock = vi.mocked(searchCatalog);

/** Drive the route the way Next does, through a real NextRequest. */
function get(query: string) {
  return GET(new NextRequest(`https://app.test/api/anime/search?${query}`));
}

function jikanPage(titles: string[], pagination = {}) {
  return {
    data: titles.map((title, i) => animeFixture({ title, mal_id: 1000 + i })),
    pagination: paginationFixture(pagination),
  };
}

/** AniList's client returns the Jikan-shaped payload our UI renders. */
function anilistPage(titles: string[], total = titles.length, lastPage = 1) {
  return {
    data: titles.map((title, i) => animeFixture({ title, mal_id: 2000 + i })),
    pagination: paginationFixture({
      last_visible_page: lastPage,
      items: { count: titles.length, total, per_page: 50 },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Default: no catalog extras, so tests opt into the merge explicitly.
  searchCatalogMock.mockResolvedValue([]);
  // The limiter's window map is module state (like jikan's cache) and every
  // request here shares one client key — clear it so no test inherits counts.
  resetRateLimit();
});

describe("happy path (MAL primary)", () => {
  it("serves MAL results and labels the source", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    const body = await (await get("q=naruto")).json();

    expect(body.source).toBe("mal");
    expect(body.results).toHaveLength(1);
    expect(body.degraded).toBeUndefined();
  });

  it("stitches two Jikan pages into one 50-result app page", async () => {
    // Jikan caps a page at 25; the app page is 50, so page 1 = Jikan 1 + 2.
    searchAnimeMock
      .mockResolvedValueOnce(jikanPage(["A"], { has_next_page: true, last_visible_page: 4 }))
      .mockResolvedValueOnce(jikanPage(["B"]));

    const body = await (await get("q=naruto")).json();

    expect(searchAnimeMock).toHaveBeenCalledTimes(2);
    expect(searchAnimeMock.mock.calls[0][1]).toBe(1);
    expect(searchAnimeMock.mock.calls[1][1]).toBe(2);
    expect(body.results).toHaveLength(2);
    // 4 Jikan pages ⇒ 2 app pages.
    expect(body.totalPages).toBe(2);
  });

  it("requests the right Jikan pages for app page 2", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["A"]));

    await get("q=naruto&page=2");

    expect(searchAnimeMock.mock.calls[0][1]).toBe(3);
  });

  it("skips the second Jikan call when there is no next page", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["A"], { has_next_page: false }));

    await get("q=naruto");

    expect(searchAnimeMock).toHaveBeenCalledTimes(1);
  });
});

describe("fallback chain", () => {
  it("falls back to AniList when MAL fails", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "gateway"));
    searchAnilistMock.mockResolvedValue(anilistPage(["Naruto"]));

    const body = await (await get("q=naruto")).json();

    expect(body.source).toBe("anilist");
    expect(body.results).toHaveLength(1);
  });

  it("falls back to the local catalog when both live engines fail", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "gateway"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockResolvedValue([animeFixture({ title: "Naruto" })]);

    const res = await get("q=naruto");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("catalog");
    // The UI needs `degraded` to tell the user results are local-only.
    expect(body.degraded).toBe(true);
  });

  it("never edge-caches a degraded response, so recovery isn't masked", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "gateway"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockResolvedValue([animeFixture()]);

    const res = await get("q=naruto");

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("edge-caches a healthy response", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    const res = await get("q=naruto");

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("returns 500 when every engine including the catalog is down", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "gateway"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockRejectedValue(new Error("db down"));

    const res = await get("q=naruto");

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeDefined();
  });

  it("passes through MAL's rate-limit signal so clients back off", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(429, "slow down"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockRejectedValue(new Error("db down"));

    expect((await get("q=naruto")).status).toBe(429);
  });

  it("never leaks the upstream error to the client", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "postgres://secret@host"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockRejectedValue(new Error("db down"));

    const body = await (await get("q=naruto")).json();

    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("AniList-only filters", () => {
  it("skips Jikan entirely for a filter MAL cannot express", async () => {
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const body = await (await get("q=frieren&season=fall")).json();

    expect(searchAnimeMock).not.toHaveBeenCalled();
    expect(body.source).toBe("anilist");
  });

  it.each(["season=fall", "streaming=Crunchyroll", "country=JP", "source=MANGA", "min_ep=12", "max_dur=30", "doujin=true", "tags=Isekai"])(
    "routes %s to AniList",
    async (param) => {
      searchAnilistMock.mockResolvedValue(anilistPage(["X"]));

      await get(`q=test&${param}`);

      expect(searchAnimeMock).not.toHaveBeenCalled();
      expect(searchAnilistMock).toHaveBeenCalled();
    },
  );

  it("fails honestly rather than serving catalog results the filter can't match", async () => {
    // The catalog can't express `season`, so falling back to it would return
    // results that silently ignore the user's filter.
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "boom"));
    searchCatalogMock.mockResolvedValue([animeFixture()]);

    const res = await get("q=frieren&season=fall");

    expect(res.status).toBe(502);
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("surfaces an AniList rate limit as a 429", async () => {
    searchAnilistMock.mockRejectedValue(new AnilistError(429, "slow down"));

    expect((await get("q=frieren&season=fall")).status).toBe(429);
  });

  it("reports AniList's 5000-result cap as approximate", async () => {
    searchAnilistMock.mockResolvedValue(anilistPage(["X"], 5000, 100));

    const body = await (await get("q=xx&season=fall")).json();

    expect(body.approxTotal).toBe(true);
  });

  it("reports a real count as exact", async () => {
    searchAnilistMock.mockResolvedValue(anilistPage(["X"], 42, 1));

    const body = await (await get("q=xx&season=fall")).json();

    expect(body.approxTotal).toBe(false);
    expect(body.totalItems).toBe(42);
  });
});

describe("catalog merge", () => {
  it("appends catalog substring hits the live engine missed", async () => {
    // AniList matches whole tokens only, so a partial prefix finds nothing
    // upstream while the catalog's ilike %q% does.
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));
    searchCatalogMock.mockResolvedValue([animeFixture({ mal_id: 999, title: "Narutaru" })]);

    const body = await (await get("q=narut")).json();

    expect(body.results.map((r: { title: string }) => r.title)).toEqual([
      "Naruto",
      "Narutaru",
    ]);
  });

  it("puts catalog hits first when the live engine found nothing", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage([]));
    searchCatalogMock.mockResolvedValue([animeFixture({ mal_id: 999, title: "Narutaru" })]);

    const body = await (await get("q=narut")).json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Narutaru");
  });

  it("dedupes catalog hits against live results by mal_id", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));
    // Same mal_id the live engine already returned (1000, from jikanPage).
    searchCatalogMock.mockResolvedValue([animeFixture({ mal_id: 1000, title: "Naruto" })]);

    const body = await (await get("q=naruto")).json();

    expect(body.results).toHaveLength(1);
  });

  it("does not merge on page 2", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    await get("q=naruto&page=2");

    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("does not merge a pure browse (no text query)", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    await get("genres=1");

    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("keeps live results when the catalog merge throws", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));
    searchCatalogMock.mockRejectedValue(new Error("db down"));

    const res = await get("q=naruto");

    expect(res.status).toBe(200);
    expect((await res.json()).results).toHaveLength(1);
  });

  it("counts merged extras in totalItems", async () => {
    searchAnimeMock.mockResolvedValue(
      jikanPage(["Naruto"], { items: { count: 1, total: 1, per_page: 25 } }),
    );
    searchCatalogMock.mockResolvedValue([
      animeFixture({ mal_id: 998 }),
      animeFixture({ mal_id: 999 }),
    ]);

    const body = await (await get("q=narut")).json();

    // Upstream said 1, but we're returning 3 — the count must not undercut.
    expect(body.totalItems).toBe(3);
  });
});

describe("query validation", () => {
  it("rejects a request with neither query nor filters", async () => {
    expect((await get("")).status).toBe(400);
    expect(searchAnimeMock).not.toHaveBeenCalled();
  });

  it("rejects a one-character query", async () => {
    expect((await get("q=a")).status).toBe(400);
  });

  it("rejects a non-numeric page", async () => {
    expect((await get("q=naruto&page=abc")).status).toBe(400);
  });

  it("rejects page 0", async () => {
    expect((await get("q=naruto&page=0")).status).toBe(400);
  });

  it("rejects malformed genre ids", async () => {
    expect((await get("q=naruto&genres=1;DROP")).status).toBe(400);
  });

  it("rejects an out-of-range year", async () => {
    expect((await get("q=naruto&year=1234567")).status).toBe(400);
  });

  it("rejects an unknown format", async () => {
    expect((await get("q=naruto&format=hologram")).status).toBe(400);
  });

  it("returns the validation messages", async () => {
    const body = await (await get("q=a")).json();

    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringContaining("2 characters")]),
    );
  });

  it("allows a genre-only browse", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["X"]));

    expect((await get("genres=1")).status).toBe(200);
  });

  it("caps genre ids at 8", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["X"]));

    await get(`genres=${Array.from({ length: 12 }, (_, i) => i + 1).join(",")}`);

    expect(searchAnimeMock.mock.calls[0][2]).toHaveLength(8);
  });

  it("drops unknown tags instead of forwarding them upstream", async () => {
    searchAnilistMock.mockResolvedValue(anilistPage(["X"]));

    await get("q=test&tags=Isekai,NotARealTag");

    expect(searchAnilistMock.mock.calls[0][0].tags).toEqual(["Isekai"]);
  });
});

describe("per-IP rate limiting", () => {
  /** Same route entry point, but with a spoofable-but-good-enough client IP. */
  function getAs(ip: string, query = "q=naruto") {
    return GET(
      new NextRequest(`https://app.test/api/anime/search?${query}`, {
        headers: { "x-forwarded-for": ip },
      }),
    );
  }

  it("429s the 61st request in a window, with Retry-After", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    for (let i = 0; i < 60; i++) {
      expect((await getAs("203.0.113.9")).status).toBe(200);
    }
    const limited = await getAs("203.0.113.9");

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    // A limited response must never be cached at the edge.
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
  });

  it("limits per client — one abuser does not lock out another IP", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    for (let i = 0; i < 61; i++) await getAs("203.0.113.9");

    expect((await getAs("198.51.100.7")).status).toBe(200);
  });

  it("rejects before touching upstream engines", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));

    for (let i = 0; i < 61; i++) await getAs("203.0.113.9");
    searchAnimeMock.mockClear();

    await getAs("203.0.113.9");

    expect(searchAnimeMock).not.toHaveBeenCalled();
  });
});

describe("hedging a slow Jikan", () => {
  /** Jikan that never answers inside the test — the slow-upstream case. */
  const hang = () => new Promise<never>(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("races AniList after 1.2s on the type-ahead path, and takes its answer", async () => {
    searchAnimeMock.mockImplementation(hang);
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const res = get("q=frieren&limit=6");
    await vi.advanceTimersByTimeAsync(1_199);
    expect(searchAnilistMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    const body = await (await res).json();
    expect(body.source).toBe("anilist");
    expect(body.results[0].title).toBe("Frieren");
  });

  it("gives the search page longer (2.5s) before hedging", async () => {
    searchAnimeMock.mockImplementation(hang);
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const res = get("q=frieren");
    await vi.advanceTimersByTimeAsync(2_499);
    expect(searchAnilistMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect((await (await res).json()).source).toBe("anilist");
  });

  it("never touches AniList when Jikan answers in time — no doubled load", async () => {
    searchAnimeMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(jikanPage(["Frieren"])), 900)),
    );

    const res = get("q=frieren&limit=6");
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await (await res).json()).source).toBe("mal");
    expect(searchAnilistMock).not.toHaveBeenCalled();
  });

  it("hedges after 400ms while Jikan's last word on this instance was no response", async () => {
    // The gap between an outage starting and the breaker opening: Jikan has
    // already timed out once, so the next call is likelier to hang than lag.
    vi.mocked(jikanRecentlyUnreachable).mockReturnValueOnce(true);
    searchAnimeMock.mockImplementation(hang);
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const res = get("q=frieren&limit=6");
    await vi.advanceTimersByTimeAsync(399);
    expect(searchAnilistMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect((await (await res).json()).source).toBe("anilist");
  });

  it("uses the short delay on the search page too", async () => {
    vi.mocked(jikanRecentlyUnreachable).mockReturnValueOnce(true);
    searchAnimeMock.mockImplementation(hang);
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const res = get("q=frieren");
    await vi.advanceTimersByTimeAsync(400);

    expect((await (await res).json()).source).toBe("anilist");
  });

  it("hands AniList the request's signal, so a departed caller can leave its queue", async () => {
    searchAnimeMock.mockImplementation(hang);
    searchAnilistMock.mockResolvedValue(anilistPage(["Frieren"]));

    const res = get("q=frieren&limit=6");
    await vi.advanceTimersByTimeAsync(1_200);
    await res;

    expect(searchAnilistMock.mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("type-ahead path (limit)", () => {
  it("makes one Jikan request sized to the limit — no page-2 stitch", async () => {
    searchAnimeMock.mockResolvedValue(
      jikanPage(["A", "B", "C", "D", "E", "F"], { has_next_page: true, last_visible_page: 9 }),
    );

    const body = await (await get("q=naruto&limit=6")).json();

    expect(searchAnimeMock).toHaveBeenCalledTimes(1);
    expect(searchAnimeMock.mock.calls[0][1]).toBe(1);
    expect(searchAnimeMock.mock.calls[0][3]).toMatchObject({ limit: 6 });
    expect(body.results).toHaveLength(6);
  });

  it("sizes the AniList fallback to the limit too", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "down"));
    searchAnilistMock.mockResolvedValue(anilistPage(["Naruto"]));

    await get("q=naruto&limit=6");

    expect(searchAnilistMock.mock.calls[0][0]).toMatchObject({ perPage: 6 });
  });

  it("caps catalog extras at the limit", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["A", "B", "C", "D", "E"]));
    searchCatalogMock.mockResolvedValue([
      animeFixture({ mal_id: 1, title: "Cat 1" }),
      animeFixture({ mal_id: 2, title: "Cat 2" }),
    ]);

    const body = await (await get("q=naruto&limit=6")).json();

    expect(body.results.map((r: { title: string }) => r.title)).toEqual([
      "A", "B", "C", "D", "E", "Cat 1",
    ]);
  });

  it("rejects a limit above Jikan's page cap", async () => {
    expect((await get("q=naruto&limit=26")).status).toBe(400);
  });
});

describe("catalog lookup runs alongside the live engines", () => {
  it("starts before Jikan has answered", async () => {
    type JikanPage = Awaited<ReturnType<typeof searchAnime>>;
    let answerJikan!: (v: JikanPage) => void;
    searchAnimeMock.mockImplementation(
      () => new Promise<JikanPage>((r) => (answerJikan = r)),
    );

    const res = get("q=naruto");
    await new Promise((r) => setTimeout(r, 0));
    expect(searchCatalogMock).toHaveBeenCalledTimes(1);

    answerJikan(jikanPage(["Naruto"]));
    expect((await res).status).toBe(200);
    // Started once, reused by the merge — not queried twice.
    expect(searchCatalogMock).toHaveBeenCalledTimes(1);
  });

  it("is reused, not re-queried, by the all-engines-down fallback", async () => {
    searchAnimeMock.mockRejectedValue(new JikanError(504, "down"));
    searchAnilistMock.mockRejectedValue(new AnilistError(500, "down"));
    searchCatalogMock.mockResolvedValue([animeFixture({ title: "Naruto" })]);

    const body = await (await get("q=naruto")).json();

    expect(body.source).toBe("catalog");
    expect(searchCatalogMock).toHaveBeenCalledTimes(1);
  });
});

describe("engine=catalog (the palette's instant first paint)", () => {
  it("answers from the catalog alone, without touching either live engine", async () => {
    searchCatalogMock.mockResolvedValue([animeFixture({ title: "Naruto" })]);

    const res = await get("q=naru&engine=catalog&limit=6");
    const body = await res.json();

    expect(body).toMatchObject({ source: "catalog", results: [{ title: "Naruto" }] });
    expect(body.degraded).toBeUndefined();
    expect(searchAnimeMock).not.toHaveBeenCalled();
    expect(searchAnilistMock).not.toHaveBeenCalled();
    expect(searchCatalogMock).toHaveBeenCalledWith("naru", [], 6);
  });

  it("is never shared at the edge — it's read under the caller's session", async () => {
    const res = await get("q=naru&engine=catalog");

    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("refuses filters the catalog can't apply rather than ignoring them", async () => {
    expect((await get("q=naru&engine=catalog&year=2020")).status).toBe(400);
    expect((await get("q=naru&engine=catalog&season=fall")).status).toBe(400);
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("has its own rate-limit bucket, so the palette's pair doesn't halve the budget", async () => {
    searchAnimeMock.mockResolvedValue(jikanPage(["Naruto"]));
    const as = (query: string) =>
      GET(
        new NextRequest(`https://app.test/api/anime/search?${query}`, {
          headers: { "x-forwarded-for": "203.0.113.50" },
        }),
      );

    for (let i = 0; i < 60; i++) await as("q=naruto");

    expect((await as("q=naruto")).status).toBe(429);
    expect((await as("q=naruto&engine=catalog")).status).toBe(200);
  });
});
