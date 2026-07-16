import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AniList client — the backup catalog, and the only engine for filters MAL
 * can't express.
 *
 * Three things here are worth pinning: the mapper (AniList's shapes have to
 * come out as `JikanAnime` or nothing in the UI renders), the MAL→AniList
 * genre/tag split (AniList rejects a query outright if a tag is passed as a
 * genre), and the filter arithmetic — AniList's comparators are *strict*, so
 * the query builder widens ranges by one to make them inclusive. An off-by-one
 * there silently returns the wrong anime, which no typecheck can see.
 */

/** Fresh module: the rate-limit chain and `lastRequestAt` are module state. */
async function loadAnilist() {
  vi.resetModules();
  return import("@/lib/anilist");
}

/** The queue spaces AniList calls ~2.1s apart; let queued work run. */
async function drainQueue(ms = 10_000) {
  await vi.advanceTimersByTimeAsync(ms);
}

let fetchMock: ReturnType<typeof vi.fn>;

/** A GraphQL 200 carrying `data`. */
function gqlOk(data: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve({ data }) };
}

function mediaFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    idMal: 52991,
    title: { romaji: "Sousou no Frieren", english: "Frieren" },
    description: "An elf mage.",
    format: "TV",
    status: "FINISHED",
    episodes: 28,
    duration: 24,
    averageScore: 93,
    popularity: 1000,
    season: "FALL",
    seasonYear: 2023,
    startDate: { year: 2023 },
    coverImage: {
      extraLarge: "https://cdn.example/xl.jpg",
      large: "https://cdn.example/l.jpg",
      medium: "https://cdn.example/m.jpg",
    },
    genres: ["Adventure"],
    studios: { nodes: [{ name: "Madhouse" }] },
    ...overrides,
  };
}

/** Wrap media in the Page envelope AniList returns. */
function pageOf(media: unknown[], pageInfo: Record<string, unknown> = {}) {
  return gqlOk({
    Page: {
      pageInfo: {
        total: media.length,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 50,
        ...pageInfo,
      },
      media,
    },
  });
}

/** The GraphQL query string sent on the Nth call. */
function sentQuery(call = 0): string {
  return JSON.parse(String(fetchMock.mock.calls[call][1].body)).query;
}

/** The GraphQL variables sent on the Nth call. */
function sentVars(call = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[call][1].body)).variables;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("malGenresToAnilist", () => {
  it("routes a real AniList genre to genres", async () => {
    const { malGenresToAnilist } = await loadAnilist();

    // 1 = Action, which AniList has as a genre.
    expect(malGenresToAnilist([1])).toEqual({ genres: ["Action"], tags: [] });
  });

  it("routes a MAL theme to tags, because AniList has no such genre", async () => {
    const { malGenresToAnilist } = await loadAnilist();

    // 62 = Isekai — a tag on AniList, not a genre. Passing it as a genre
    // makes AniList reject the whole query.
    expect(malGenresToAnilist([62])).toEqual({ genres: [], tags: ["Isekai"] });
  });

  it("renames Suspense to Thriller", async () => {
    const { malGenresToAnilist } = await loadAnilist();

    // 41 = Suspense on MAL; AniList calls it Thriller.
    expect(malGenresToAnilist([41])).toEqual({ genres: ["Thriller"], tags: [] });
  });

  it("ignores unknown ids", async () => {
    const { malGenresToAnilist } = await loadAnilist();

    expect(malGenresToAnilist([999_999])).toEqual({ genres: [], tags: [] });
  });

  it("splits a mixed list", async () => {
    const { malGenresToAnilist } = await loadAnilist();

    const { genres, tags } = malGenresToAnilist([1, 62]);

    expect(genres).toEqual(["Action"]);
    expect(tags).toEqual(["Isekai"]);
  });
});

describe("mapping to the Jikan shape", () => {
  async function mapFirst(overrides: Record<string, unknown> = {}) {
    fetchMock.mockResolvedValue(pageOf([mediaFixture(overrides)]));
    const { searchAnilist } = await loadAnilist();
    const call = searchAnilist({ query: "frieren" });
    await drainQueue();
    return (await call).data[0];
  }

  it("maps the core fields", async () => {
    expect(await mapFirst()).toMatchObject({
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren",
      episodes: 28,
      year: 2023,
      members: 1000,
    });
  });

  it("rescales AniList's 0-100 score to MAL's 0-10", async () => {
    expect((await mapFirst({ averageScore: 93 })).score).toBe(9.3);
  });

  it("keeps one decimal place when rescaling", async () => {
    expect((await mapFirst({ averageScore: 87 })).score).toBe(8.7);
  });

  it("leaves an unscored title null rather than showing 0", async () => {
    expect((await mapFirst({ averageScore: null })).score).toBeNull();
  });

  it("strips the HTML AniList puts in descriptions", async () => {
    const synopsis = (await mapFirst({ description: "<i>An elf</i> mage." })).synopsis;

    expect(synopsis).toBe("An elf mage.");
  });

  it("turns <br> into a newline", async () => {
    expect((await mapFirst({ description: "One<br>Two" })).synopsis).toBe("One\nTwo");
  });

  it.each([
    ["&quot;quoted&quot;", '"quoted"'],
    ["it&#39;s", "it's"],
    ["a &amp; b", "a & b"],
  ])("decodes %s", async (raw, expected) => {
    expect((await mapFirst({ description: raw })).synopsis).toBe(expected);
  });

  it("returns null for a description that is only markup", async () => {
    expect((await mapFirst({ description: "<p></p>" })).synopsis).toBeNull();
  });

  it("prefers the largest cover image", async () => {
    const anime = await mapFirst();

    expect(anime.images.jpg.image_url).toBe("https://cdn.example/xl.jpg");
  });

  it("falls back through the cover sizes", async () => {
    const anime = await mapFirst({
      coverImage: { extraLarge: null, large: "https://cdn.example/l.jpg", medium: null },
    });

    expect(anime.images.jpg.image_url).toBe("https://cdn.example/l.jpg");
  });

  it("tolerates a title with no cover at all", async () => {
    const anime = await mapFirst({ coverImage: null });

    expect(anime.images.jpg.image_url).toBeNull();
  });

  it.each([
    ["FINISHED", "Finished Airing"],
    ["RELEASING", "Currently Airing"],
    ["NOT_YET_RELEASED", "Not yet aired"],
    ["CANCELLED", "Discontinued"],
    ["HIATUS", "On Hiatus"],
  ])("maps status %s to %s", async (anilist, jikan) => {
    expect((await mapFirst({ status: anilist })).status).toBe(jikan);
  });

  it("passes an unrecognised status through unchanged", async () => {
    expect((await mapFirst({ status: "SOMETHING_NEW" })).status).toBe("SOMETHING_NEW");
  });

  it("says Unknown when there is no status", async () => {
    expect((await mapFirst({ status: null })).status).toBe("Unknown");
  });

  it.each([
    ["TV_SHORT", "TV"],
    ["MOVIE", "Movie"],
    ["ONA", "ONA"],
  ])("maps format %s to %s", async (anilist, jikan) => {
    expect((await mapFirst({ format: anilist })).type).toBe(jikan);
  });

  it("formats duration the way MAL words it", async () => {
    expect((await mapFirst({ duration: 24 })).duration).toBe("24 min per ep");
  });

  it("lowercases the season to match Jikan", async () => {
    expect((await mapFirst({ season: "FALL" })).season).toBe("fall");
  });

  it("falls back to the start date when there is no season year", async () => {
    const anime = await mapFirst({ seasonYear: null, startDate: { year: 1998 } });

    expect(anime.year).toBe(1998);
  });

  it("falls back to the english title when there is no romaji", async () => {
    const anime = await mapFirst({ title: { romaji: null, english: "Frieren" } });

    expect(anime.title).toBe("Frieren");
  });

  it("falls back to an AniList id label when a title has no name at all", async () => {
    const anime = await mapFirst({ id: 42, title: { romaji: null, english: null } });

    expect(anime.title).toBe("AniList #42");
  });

  it("expands genres into the named-entity shape", async () => {
    const anime = await mapFirst({ genres: ["Adventure"] });

    expect(anime.genres).toEqual([{ mal_id: 0, type: "genre", name: "Adventure", url: "" }]);
  });

  it("expands studios into the named-entity shape", async () => {
    const anime = await mapFirst();

    expect(anime.studios).toEqual([{ mal_id: 0, type: "studio", name: "Madhouse", url: "" }]);
  });

  it("tolerates missing genres and studios", async () => {
    const anime = await mapFirst({ genres: null, studios: null });

    expect(anime.genres).toEqual([]);
    expect(anime.studios).toEqual([]);
  });
});

describe("the mal_id constraint", () => {
  it("drops entries with no MAL id, which have no detail route", async () => {
    // This is the architectural limit the manhua bug came from: /anime/mal/[id]
    // needs a MAL id, so AniList-only titles can't be linked.
    fetchMock.mockResolvedValue(
      pageOf([mediaFixture({ idMal: null }), mediaFixture({ idMal: 52991 })]),
    );
    const { searchAnilist } = await loadAnilist();

    const call = searchAnilist({ query: "frieren" });
    await drainQueue();
    const res = await call;

    expect(res.data).toHaveLength(1);
    expect(res.data[0].mal_id).toBe(52991);
  });

  it("dedupes entries sharing a MAL id", async () => {
    fetchMock.mockResolvedValue(pageOf([mediaFixture(), mediaFixture({ id: 2 })]));
    const { searchAnilist } = await loadAnilist();

    const call = searchAnilist({ query: "frieren" });
    await drainQueue();

    expect((await call).data).toHaveLength(1);
  });

  it("reports the count after dropping, not AniList's raw total", async () => {
    fetchMock.mockResolvedValue(pageOf([mediaFixture({ idMal: null })], { total: 50 }));
    const { searchAnilist } = await loadAnilist();

    const call = searchAnilist({ query: "x" });
    await drainQueue();
    const res = await call;

    // `count` is what we actually returned; `total` stays AniList's figure.
    expect(res.pagination.items.count).toBe(0);
    expect(res.pagination.items.total).toBe(50);
  });

  it("never reports zero pages", async () => {
    fetchMock.mockResolvedValue(pageOf([mediaFixture()], { lastPage: 0 }));
    const { searchAnilist } = await loadAnilist();

    const call = searchAnilist({ query: "x" });
    await drainQueue();

    expect((await call).pagination.last_visible_page).toBe(1);
  });
});

describe("query building", () => {
  async function search(filters: Record<string, unknown>) {
    fetchMock.mockResolvedValue(pageOf([mediaFixture()]));
    const { searchAnilist } = await loadAnilist();
    const call = searchAnilist(filters as Parameters<typeof searchAnilist>[0]);
    await drainQueue();
    await call;
  }

  it("sorts by match relevance for a text query", async () => {
    await search({ query: "frieren" });

    expect(sentQuery()).toContain("sort: SEARCH_MATCH");
  });

  it("sorts a filter-only browse by popularity", async () => {
    await search({ genreIds: [1] });

    expect(sentQuery()).toContain("sort: POPULARITY_DESC");
  });

  it("always excludes adult titles", async () => {
    await search({ query: "x" });

    expect(sentQuery()).toContain("isAdult: false");
  });

  it("omits filters entirely rather than passing null", async () => {
    // AniList treats an explicit null differently from an omitted argument, so
    // declaring unused variables changes the results.
    await search({ query: "frieren" });

    expect(sentQuery()).not.toContain("$season");
    expect(sentVars()).not.toHaveProperty("season");
  });

  it("declares a variable only when the filter is set", async () => {
    await search({ query: "x", season: "fall" });

    expect(sentQuery()).toContain("$season: MediaSeason");
    expect(sentVars().season).toBe("FALL");
  });

  it("brackets an exact year as a fuzzy-date window", async () => {
    await search({ query: "x", year: 2023 });

    // AniList dates are ints: 2023 → [20230000, 20240000).
    expect(sentVars()).toMatchObject({ startGreater: 20_230_000, startLesser: 20_240_000 });
  });

  it("lets an exact year override the range slider", async () => {
    await search({ query: "x", year: 2023, minYear: 1990, maxYear: 2000 });

    expect(sentVars()).toMatchObject({ startGreater: 20_230_000, startLesser: 20_240_000 });
  });

  it("widens the episode floor by one, because the comparator is strict", async () => {
    // episodes_greater is exclusive, so min 12 must be sent as 11 to include 12.
    await search({ query: "x", minEpisodes: 12 });

    expect(sentVars().epGreater).toBe(11);
  });

  it("widens the episode ceiling by one for the same reason", async () => {
    await search({ query: "x", maxEpisodes: 24 });

    expect(sentVars().epLesser).toBe(25);
  });

  it("omits a zero episode floor instead of sending -1", async () => {
    await search({ query: "x", minEpisodes: 0 });

    expect(sentVars()).not.toHaveProperty("epGreater");
  });

  it("widens the duration bounds the same way", async () => {
    await search({ query: "x", minDuration: 20, maxDuration: 30 });

    expect(sentVars()).toMatchObject({ durGreater: 19, durLesser: 31 });
  });

  it("expresses doujin as not licensed", async () => {
    await search({ query: "x", doujin: true });

    expect(sentVars().isLicensed).toBe(false);
  });

  it("omits the licence filter when doujin is off", async () => {
    await search({ query: "x", doujin: false });

    expect(sentVars()).not.toHaveProperty("isLicensed");
  });

  it("merges genre-derived tags with explicit ones, without duplicates", async () => {
    // 62 = Isekai, which also arrives as an explicit tag.
    await search({ query: "x", genreIds: [62], tags: ["Isekai", "Revenge"] });

    expect(sentVars().tags).toEqual(["Isekai", "Revenge"]);
  });

  it("sends a streaming service as a licensedBy list", async () => {
    await search({ query: "x", streaming: "Crunchyroll" });

    expect(sentVars().licensedBy).toEqual(["Crunchyroll"]);
  });

  it("requests the page it was asked for", async () => {
    fetchMock.mockResolvedValue(pageOf([mediaFixture()]));
    const { searchAnilist } = await loadAnilist();
    const call = searchAnilist({ query: "x" }, 3);
    await drainQueue();
    await call;

    expect(sentVars().page).toBe(3);
  });
});

describe("errors", () => {
  it("raises AnilistError with the status and message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: () => Promise.resolve({ errors: [{ message: "rate limited" }] }),
    });
    const { searchAnilist, AnilistError } = await loadAnilist();

    const call = searchAnilist({ query: "x" }).catch((e: unknown) => e);
    await drainQueue();
    const err = await call;

    expect(err).toBeInstanceOf(AnilistError);
    expect((err as InstanceType<typeof AnilistError>).status).toBe(429);
    expect((err as Error).message).toContain("rate limited");
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: () => Promise.reject(new SyntaxError("nope")),
    });
    const { searchAnilist } = await loadAnilist();

    const call = searchAnilist({ query: "x" }).catch((e: unknown) => e);
    await drainQueue();

    expect((await call as Error).message).toContain("Bad Gateway");
  });

  it("treats a 200 carrying GraphQL errors as a failure", async () => {
    // GraphQL reports query errors with HTTP 200 — trusting the status alone
    // would surface an empty page as a successful search.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ errors: [{ message: "Unknown tag" }] }),
    });
    const { searchAnilist, AnilistError } = await loadAnilist();

    const call = searchAnilist({ query: "x" }).catch((e: unknown) => e);
    await drainQueue();

    expect(await call).toBeInstanceOf(AnilistError);
  });

  it("treats a 200 with no data as a failure", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });
    const { searchAnilist, AnilistError } = await loadAnilist();

    const call = searchAnilist({ query: "x" }).catch((e: unknown) => e);
    await drainQueue();

    expect(await call).toBeInstanceOf(AnilistError);
  });
});

describe("rate limiting", () => {
  it("spaces requests to stay inside the 30/min budget", async () => {
    const times: number[] = [];
    fetchMock.mockImplementation(() => {
      times.push(Date.now());
      return Promise.resolve(pageOf([mediaFixture()]));
    });
    const { searchAnilist } = await loadAnilist();

    const work = Promise.all([
      searchAnilist({ query: "a" }),
      searchAnilist({ query: "b" }),
    ]);
    await drainQueue();
    await work;

    expect(times[1] - times[0]).toBeGreaterThanOrEqual(2_100);
  });

  it("keeps the queue alive after a failure", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: () => Promise.resolve({}),
      })
      .mockResolvedValue(pageOf([mediaFixture()]));
    const { searchAnilist } = await loadAnilist();

    const failed = searchAnilist({ query: "a" }).catch(() => "failed");
    await drainQueue();
    expect(await failed).toBe("failed");

    const after = searchAnilist({ query: "b" });
    await drainQueue();
    await expect(after).resolves.toBeDefined();
  });
});
