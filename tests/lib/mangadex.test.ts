import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The MangaDex client — third search engine, and the only source for titles
 * that exist on neither MAL nor AniList. Those are exactly the titles the
 * Manhua tab was missing, so the mapper's `mangadex_id`/`mal_id` handling is
 * what makes them linkable at /manga/md/[id].
 *
 * The language-filter tests below pin a verified bug: `originalLanguage` is
 * where a title was *first published*, so English-first webtoons are `en` and
 * a ko/zh/ja tab filter hid them on every tab.
 */

async function loadMangaDex() {
  vi.resetModules();
  return import("@/lib/mangadex");
}

/** The queue spaces MangaDex calls ~300ms apart. */
async function drainQueue(ms = 5_000) {
  await vi.advanceTimersByTimeAsync(ms);
}

let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) };
}

function mdRecord(overrides: Record<string, unknown> = {}) {
  const { relationships, ...attrs } = overrides as Record<string, never>;
  return {
    id: "uuid-1",
    attributes: {
      title: { en: "Solo Leveling" },
      altTitles: [{ en: "Only I Level Up" }],
      description: { en: "A weak hunter." },
      links: { mal: "121496" },
      originalLanguage: "ko",
      status: "completed",
      year: 2018,
      lastChapter: "179",
      contentRating: "safe",
      tags: [
        { attributes: { name: { en: "Action" }, group: "genre" } },
      ],
      ...attrs,
    },
    relationships: relationships ?? [
      { type: "cover_art", attributes: { fileName: "cover.jpg" } },
      { type: "author", attributes: { name: "Chugong" } },
    ],
  };
}

/** The URL string of the Nth fetch. */
const sentUrl = (call = 0) => String(fetchMock.mock.calls[call][0]);
/** Parsed query params of the Nth fetch. */
const sentParams = (call = 0) => new URL(sentUrl(call)).searchParams;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mapping to the Jikan manga shape", () => {
  async function mapFirst(overrides: Record<string, unknown> = {}) {
    fetchMock.mockResolvedValue(ok({ data: [mdRecord(overrides)], total: 1 }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga("solo");
    await drainQueue();
    return (await call).results[0];
  }

  it("maps the core fields", async () => {
    expect(await mapFirst()).toMatchObject({
      mal_id: 121_496,
      mangadex_id: "uuid-1",
      title: "Solo Leveling",
      type: "Manhwa",
      status: "Finished",
    });
  });

  it("parses the MAL link into a numeric id", async () => {
    expect((await mapFirst({ links: { mal: "2" } })).mal_id).toBe(2);
  });

  it("leaves mal_id null when the title has no MAL entry", async () => {
    // The whole point of this engine: these titles are addressable only by
    // mangadex_id, and are what the Manhua tab was dropping.
    const manga = await mapFirst({ links: {} });

    expect(manga.mal_id).toBeNull();
    expect(manga.mangadex_id).toBe("uuid-1");
  });

  it("leaves mal_id null when there are no links at all", async () => {
    expect((await mapFirst({ links: null })).mal_id).toBeNull();
  });

  it.each(["not-a-number", "0", "-5", ""])(
    "leaves mal_id null for junk link %o",
    async (mal) => {
      expect((await mapFirst({ links: { mal } })).mal_id).toBeNull();
    },
  );

  it("always carries the mangadex_id, even for MAL-linked titles", async () => {
    expect((await mapFirst()).mangadex_id).toBe("uuid-1");
  });

  it("builds the cover URL from the record and file name", async () => {
    const manga = await mapFirst();

    expect(manga.images.jpg.image_url).toBe(
      "https://uploads.mangadex.org/covers/uuid-1/cover.jpg.512.jpg",
    );
  });

  it("leaves the cover null when the record has none", async () => {
    const manga = await mapFirst({ relationships: [] });

    expect(manga.images.jpg.image_url).toBeNull();
  });

  it("falls back to any title when there is no English one", async () => {
    const manga = await mapFirst({ title: { ja: "ソロレベリング" } });

    expect(manga.title).toBe("ソロレベリング");
  });

  it("falls back to a MangaDex id label when a record has no title", async () => {
    const manga = await mapFirst({ title: null, altTitles: [] });

    expect(manga.title).toBe("MangaDex uuid-1");
  });

  it("takes the english title from altTitles when the main title is not English", async () => {
    const manga = await mapFirst({
      title: { ja: "ソロレベリング" },
      altTitles: [{ en: "Solo Leveling" }],
    });

    expect(manga.title_english).toBe("Solo Leveling");
  });

  it("does not repeat the english title when it is already the main one", async () => {
    // Rendering "Solo Leveling / Solo Leveling" on the card would be silly.
    expect((await mapFirst()).title_english).toBeNull();
  });

  it("floors a decimal last chapter into a count", async () => {
    expect((await mapFirst({ lastChapter: "179.5" })).chapters).toBe(179);
  });

  it("leaves chapters null when the last chapter is unknown", async () => {
    expect((await mapFirst({ lastChapter: null })).chapters).toBeNull();
  });

  it("leaves chapters null for an unparsable last chapter", async () => {
    expect((await mapFirst({ lastChapter: "N/A" })).chapters).toBeNull();
  });

  it.each([
    ["ongoing", "Publishing"],
    ["completed", "Finished"],
    ["hiatus", "On Hiatus"],
    ["cancelled", "Discontinued"],
  ])("maps status %s to %s", async (md, display) => {
    expect((await mapFirst({ status: md })).status).toBe(display);
  });

  it("says Unknown when there is no status", async () => {
    expect((await mapFirst({ status: null })).status).toBe("Unknown");
  });

  it.each([
    ["ko", "Manhwa"],
    ["zh", "Manhua"],
    ["zh-hk", "Manhua"],
    ["ja", "Manga"],
    ["en", "Manga"],
  ])("maps original language %s to %s", async (lang, type) => {
    expect((await mapFirst({ originalLanguage: lang })).type).toBe(type);
  });

  it("keeps genre and theme tags", async () => {
    const manga = await mapFirst({
      tags: [
        { attributes: { name: { en: "Action" }, group: "genre" } },
        { attributes: { name: { en: "Isekai" }, group: "theme" } },
      ],
    });

    expect(manga.genres.map((g) => g.name)).toEqual(["Action", "Isekai"]);
  });

  it("drops tag groups that are not genres or themes", async () => {
    const manga = await mapFirst({
      tags: [
        { attributes: { name: { en: "Action" }, group: "genre" } },
        { attributes: { name: { en: "Long Strip" }, group: "format" } },
      ],
    });

    expect(manga.genres.map((g) => g.name)).toEqual(["Action"]);
  });

  it("drops a tag with no usable name", async () => {
    const manga = await mapFirst({ tags: [{ attributes: { name: {}, group: "genre" } }] });

    expect(manga.genres).toEqual([]);
  });

  it("reads authors from the relationships", async () => {
    const manga = await mapFirst();

    expect(manga.authors).toEqual([
      { mal_id: 0, type: "people", name: "Chugong", url: "" },
    ]);
  });

  it("returns no authors when none are included", async () => {
    expect((await mapFirst({ relationships: [] })).authors).toEqual([]);
  });

  it("turns the year into a published-from date", async () => {
    expect((await mapFirst({ year: 2018 })).published?.from).toBe("2018-01-01T00:00:00Z");
  });

  it("leaves published-from null without a year", async () => {
    expect((await mapFirst({ year: null })).published?.from).toBeNull();
  });

  it("has no score, because MangaDex does not rate titles", async () => {
    expect((await mapFirst()).score).toBeNull();
  });

  it("treats a whitespace-only description as absent", async () => {
    expect((await mapFirst({ description: { en: "   " } })).synopsis).toBeNull();
  });
});

describe("searchMangaDexManga", () => {
  async function search(...args: Parameters<Awaited<ReturnType<typeof loadMangaDex>>["searchMangaDexManga"]>) {
    fetchMock.mockResolvedValue(ok({ data: [], total: 0 }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga(...args);
    await drainQueue();
    return call;
  }

  it("filters by language when browsing a tab", async () => {
    await search("", 1, "manhua");

    expect(sentParams().getAll("originalLanguage[]")).toEqual(["zh"]);
  });

  it.each([
    ["manga", "ja"],
    ["manhwa", "ko"],
    ["manhua", "zh"],
  ])("browses the %s tab as language %s", async (type, lang) => {
    await search("", 1, type as "manga" | "manhwa" | "manhua");

    expect(sentParams().getAll("originalLanguage[]")).toEqual([lang]);
  });

  it("does NOT filter by language when searching by name", async () => {
    // "The Beginning After the End" is originalLanguage `en`, so a ko/zh/ja
    // filter hid it on every tab. When searching, relevance beats tab purity.
    await search("beginning after the end", 1, "manhua");

    expect(sentParams().getAll("originalLanguage[]")).toEqual([]);
  });

  it("has no language filter for an untabbed browse", async () => {
    await search("", 1, undefined);

    expect(sentParams().getAll("originalLanguage[]")).toEqual([]);
  });

  it("orders by relevance when searching", async () => {
    await search("solo");

    expect(sentParams().get("order[relevance]")).toBe("desc");
    expect(sentParams().get("title")).toBe("solo");
  });

  it("orders by followers when browsing", async () => {
    await search("");

    expect(sentParams().get("order[followedCount]")).toBe("desc");
    expect(sentParams().has("title")).toBe(false);
  });

  it("treats a whitespace query as a browse", async () => {
    await search("   ");

    expect(sentParams().get("order[followedCount]")).toBe("desc");
  });

  it("truncates an overlong title query", async () => {
    await search("x".repeat(200));

    expect(sentParams().get("title")).toHaveLength(100);
  });

  it("requests the cover art alongside the record", async () => {
    // Without this the grid renders posterless cards.
    await search("solo");

    expect(sentParams().getAll("includes[]")).toContain("cover_art");
  });

  it("excludes adult content ratings", async () => {
    await search("solo");

    expect(sentParams().getAll("contentRating[]")).toEqual(["safe", "suggestive"]);
  });

  it("pages by offset", async () => {
    await search("solo", 3);

    expect(sentParams().get("offset")).toBe("80");
    expect(sentParams().get("limit")).toBe("40");
  });

  it("derives the page count from the reported total", async () => {
    fetchMock.mockResolvedValue(ok({ data: [], total: 81 }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga("solo");
    await drainQueue();

    expect((await call).totalPages).toBe(3);
  });

  it("never reports zero pages", async () => {
    fetchMock.mockResolvedValue(ok({ data: [], total: 0 }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga("solo");
    await drainQueue();

    expect((await call).totalPages).toBe(1);
  });

  it("falls back to the result count when no total is reported", async () => {
    fetchMock.mockResolvedValue(ok({ data: [mdRecord()] }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga("solo");
    await drainQueue();

    expect((await call).totalPages).toBe(1);
  });
});

describe("searchMangaDexWebComics", () => {
  async function webComics(query = "", page = 1, genres: string[] = []) {
    fetchMock.mockResolvedValue(ok({ data: [], total: 0 }));
    const { searchMangaDexWebComics } = await loadMangaDex();
    const call = searchMangaDexWebComics(query, page, genres);
    await drainQueue();
    return call;
  }

  it("always requires the Web Comic tag", async () => {
    await webComics();

    expect(sentParams().getAll("includedTags[]")).toContain(
      "e197df38-d0e7-43b5-9b09-2842d0c326dd",
    );
  });

  it("AND-matches the tags", async () => {
    await webComics();

    expect(sentParams().get("includedTagsMode")).toBe("AND");
  });

  it("translates a genre name to its MangaDex tag uuid", async () => {
    await webComics("", 1, ["Action"]);

    expect(sentParams().getAll("includedTags[]")).toEqual([
      "e197df38-d0e7-43b5-9b09-2842d0c326dd",
      "391b0423-d847-456f-aff0-8b0cfc03066b",
    ]);
  });

  it("silently ignores a genre MangaDex models differently", async () => {
    // Demographics like Shounen aren't tags here; the query just doesn't
    // narrow, rather than failing.
    await webComics("", 1, ["Shounen"]);

    expect(sentParams().getAll("includedTags[]")).toEqual([
      "e197df38-d0e7-43b5-9b09-2842d0c326dd",
    ]);
  });

  it("orders by relevance when searching", async () => {
    await webComics("tower");

    expect(sentParams().get("order[relevance]")).toBe("desc");
  });

  it("orders by followers when browsing", async () => {
    await webComics("");

    expect(sentParams().get("order[followedCount]")).toBe("desc");
  });
});

describe("getMangaDexMangaDetail", () => {
  it("maps a found record", async () => {
    fetchMock.mockResolvedValue(ok({ data: mdRecord() }));
    const { getMangaDexMangaDetail } = await loadMangaDex();
    const call = getMangaDexMangaDetail("uuid-1");
    await drainQueue();

    expect(await call).toMatchObject({ mangadex_id: "uuid-1", title: "Solo Leveling" });
  });

  it("returns null when the record is missing", async () => {
    fetchMock.mockResolvedValue(ok({ data: null }));
    const { getMangaDexMangaDetail } = await loadMangaDex();
    const call = getMangaDexMangaDetail("nope");
    await drainQueue();

    expect(await call).toBeNull();
  });

  it("asks for the author, which the search endpoint omits", async () => {
    fetchMock.mockResolvedValue(ok({ data: mdRecord() }));
    const { getMangaDexMangaDetail } = await loadMangaDex();
    const call = getMangaDexMangaDetail("uuid-1");
    await drainQueue();
    await call;

    expect(sentParams().getAll("includes[]")).toEqual(["cover_art", "author"]);
  });
});

describe("transport", () => {
  it("raises MangaDexError with the status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: "Unavailable" });
    const { searchMangaDexManga, MangaDexError } = await loadMangaDex();

    const call = searchMangaDexManga("x").catch((e: unknown) => e);
    await drainQueue();
    const err = await call;

    expect(err).toBeInstanceOf(MangaDexError);
    expect((err as InstanceType<typeof MangaDexError>).status).toBe(503);
  });

  it("sends the descriptive User-Agent the API requires", async () => {
    fetchMock.mockResolvedValue(ok({ data: [], total: 0 }));
    const { searchMangaDexManga } = await loadMangaDex();
    const call = searchMangaDexManga("x");
    await drainQueue();
    await call;

    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain("anime-maniacs");
  });

  it("spaces requests to respect the rate limit", async () => {
    const times: number[] = [];
    fetchMock.mockImplementation(() => {
      times.push(Date.now());
      return Promise.resolve(ok({ data: [], total: 0 }));
    });
    const { searchMangaDexManga } = await loadMangaDex();

    const work = Promise.all([searchMangaDexManga("a"), searchMangaDexManga("b")]);
    await drainQueue();
    await work;

    expect(times[1] - times[0]).toBeGreaterThanOrEqual(300);
  });
});
