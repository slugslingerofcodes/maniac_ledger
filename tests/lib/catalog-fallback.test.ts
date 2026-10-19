import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tables } from "@/lib/database.types";
import { clientReturning, queryBuilder, RPC_NOT_FOUND } from "../helpers/supabase";

/**
 * The last link in the anime fallback chain: the local `anime` catalog, which
 * keeps search working when both MAL and AniList are unreachable.
 *
 * Two things here are worth pinning. First the mapper — catalog rows use our
 * DB enums and have to come back out shaped like a JikanAnime, because the UI
 * only knows that shape. Second the filters: the catalog is shared across the
 * SFW and adult surfaces, so an exclusion going missing leaks adult titles into
 * the public search API.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const {
  __resetCatalogSearchMemo,
  catalogRowToJikan,
  searchCatalog,
  searchAdultCatalog,
  randomCatalogAnime,
} = await import("@/lib/catalog-fallback");

const createClientMock = vi.mocked(createClient);

/**
 * A catalog row for the mapper tests.
 *
 * `overrides` is deliberately looser than `Partial<Tables<"anime">>` on the
 * value side: a few tests feed values the schema itself forbids (`genres` is
 * `text[] not null default '{}'`, yet one case passes `null`) precisely to
 * cover the mapper's defensive `?? []` branches — which exist because a row can
 * still arrive misshapen from a partial select or a types file that has drifted
 * from the SQL. Keys stay checked, so a typo'd column name is still an error.
 */
function animeRow(
  overrides: Partial<Record<keyof Tables<"anime">, unknown>> = {},
): Tables<"anime"> {
  return {
    id: "uuid-1",
    mal_id: 52991,
    title: "Sousou no Frieren",
    title_english: "Frieren",
    synopsis: "An elf mage.",
    type: "TV",
    total_episodes: 28,
    score: 9.3,
    status: "finished_airing",
    season: "fall",
    year: 2023,
    poster_url: "https://cdn.example/p.jpg",
    genres: ["Adventure", "Fantasy"],
    studio: "Madhouse",
    ...overrides,
  } as unknown as Tables<"anime">;
}

/**
 * Point `createClient` at a builder resolving to `data`, and hand it back. The
 * client's RPC reports "no such function" — the database before 0030 — so
 * `searchCatalog` exercises its substring fallback; see "ranked search" below
 * for the RPC path.
 */
function withRows(data: unknown, extra: { count?: number } = {}) {
  const builder = queryBuilder({ data, ...extra });
  createClientMock.mockResolvedValue(
    clientReturning(builder) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return builder;
}

/** A client whose `search_anime_catalog` RPC answers `rpcResult`. */
function withRpc(rpcResult: unknown, fallbackRows: unknown = []) {
  const builder = queryBuilder({ data: fallbackRows });
  const client = clientReturning(builder, rpcResult);
  createClientMock.mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return { builder, rpc: client.rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCatalogSearchMemo();
});

describe("searchCatalog", () => {
  it("maps a catalog row onto the JikanAnime shape the UI renders", async () => {
    withRows([animeRow()]);

    const [anime] = await searchCatalog("frieren");

    expect(anime).toMatchObject({
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren",
      episodes: 28,
      score: 9.3,
      year: 2023,
    });
  });

  it("translates the DB status enum into MAL's display string", async () => {
    withRows([animeRow({ status: "currently_airing" })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.status).toBe("Currently Airing");
  });

  it.each([
    ["finished_airing", "Finished Airing"],
    ["not_yet_aired", "Not yet aired"],
    ["hiatus", "On Hiatus"],
    ["cancelled", "Discontinued"],
  ])("maps status %s to %s", async (dbStatus, display) => {
    withRows([animeRow({ status: dbStatus as Tables<"anime">["status"] })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.status).toBe(display);
  });

  it("expands genre names into the named-entity shape", async () => {
    withRows([animeRow({ genres: ["Adventure"] })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.genres).toEqual([
      { mal_id: 0, type: "genre", name: "Adventure", url: "" },
    ]);
  });

  it("tolerates a row with no genres", async () => {
    withRows([animeRow({ genres: null })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.genres).toEqual([]);
  });

  it("returns no studios when the row has none", async () => {
    withRows([animeRow({ studio: null })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.studios).toEqual([]);
  });

  it("uses the poster for every image size", async () => {
    withRows([animeRow({ poster_url: "https://cdn.example/p.jpg" })]);

    const [anime] = await searchCatalog("frieren");

    expect(anime.images.jpg.image_url).toBe("https://cdn.example/p.jpg");
    expect(anime.images.webp.large_image_url).toBe("https://cdn.example/p.jpg");
  });

  it("excludes Hentai rows from this SFW surface", async () => {
    // The adult tab writes into the same shared catalog, and this feeds the
    // public search API — so the exclusion is a boundary, not a preference.
    const builder = withRows([animeRow()]);

    await searchCatalog("frieren");

    expect(builder.calls).toContainEqual({
      method: "not",
      args: ["genres", "cs", "{Hentai}"],
    });
  });

  it("skips rows with no mal_id, which have no detail route", async () => {
    withRows([animeRow({ mal_id: null })]);

    expect(await searchCatalog("frieren")).toEqual([]);
  });

  it("dedupes rows sharing a mal_id", async () => {
    withRows([animeRow(), animeRow({ id: "uuid-2" })]);

    expect(await searchCatalog("frieren")).toHaveLength(1);
  });

  it("returns nothing for an empty query with no genres", async () => {
    // Guards against an unfiltered scan of the whole catalog.
    const builder = withRows([animeRow()]);

    expect(await searchCatalog("")).toEqual([]);
    expect(builder.called("select")).toBe(false);
  });

  it("strips ilike wildcards so a bare % is not a match-everything query", async () => {
    const builder = withRows([]);

    await searchCatalog("100% hero");

    expect(builder.argsOf("or")).toEqual([
      "title.ilike.%100  hero%,title_english.ilike.%100  hero%",
    ]);
  });

  it("strips the commas and parens that would break .or() syntax", async () => {
    const builder = withRows([]);

    await searchCatalog("Fate/stay night (UBW), Part 2");

    // The filter's own commas separate the two ilike clauses, so assert on the
    // interpolated term rather than the whole string.
    const filter = String(builder.argsOf("or")?.[0]);
    const [, term] = /title\.ilike\.%(.*?)%,/.exec(filter) ?? [];
    expect(term).toBeDefined();
    expect(term).not.toMatch(/[(),%_]/);
    expect(term).toContain("Fate/stay night");
  });

  it("searches the english title as well as the romaji one", async () => {
    const builder = withRows([]);

    await searchCatalog("frieren");

    expect(String(builder.argsOf("or")?.[0])).toContain("title_english.ilike");
  });

  it("browses by genre alone when there is no query", async () => {
    const builder = withRows([animeRow()]);

    // 1 = Action in the MAL genre table.
    const results = await searchCatalog("", [1]);

    expect(results).toHaveLength(1);
    expect(builder.argsOf("contains")).toEqual(["genres", ["Action"]]);
    expect(builder.called("or")).toBe(false);
  });

  it("ignores unknown genre ids", async () => {
    const builder = withRows([animeRow()]);

    await searchCatalog("frieren", [999_999]);

    expect(builder.called("contains")).toBe(false);
  });

  it("ranks by score, best first, with unscored rows last", async () => {
    const builder = withRows([animeRow()]);

    await searchCatalog("frieren");

    expect(builder.argsOf("order")).toEqual([
      "score",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("returns [] when RLS blocks the read", async () => {
    // No session ⇒ PostgREST returns null data rather than throwing; the
    // caller must degrade to empty, not crash the search route.
    withRows(null);

    expect(await searchCatalog("frieren")).toEqual([]);
  });
});

describe("ranked search (search_anime_catalog, 0030)", () => {
  it("asks the RPC first, with the query as typed", async () => {
    // Wildcards are escaped inside the function, so nothing is stripped here.
    const { rpc, builder } = withRpc({ data: [animeRow()], error: null });

    const results = await searchCatalog("100% hero", [1], 6);

    expect(rpc).toHaveBeenCalledWith("search_anime_catalog", {
      q: "100% hero",
      genre_names: ["Action"],
      max_results: 6,
    });
    expect(results.map((a) => a.mal_id)).toEqual([52991]);
    // The substring fallback is never sent when the RPC answered.
    expect(builder.called("select")).toBe(false);
  });

  it("keeps the RPC's order — it ranks by match quality, not score", async () => {
    withRpc({
      data: [
        animeRow({ mal_id: 1, title: "Naruto", score: 8.0 }),
        animeRow({ mal_id: 2, title: "Boruto", score: 9.9 }),
      ],
      error: null,
    });

    const results = await searchCatalog("narut");

    expect(results.map((a) => a.title)).toEqual(["Naruto", "Boruto"]);
  });

  it("asks for at most the RPC's own cap of 50", async () => {
    const { rpc } = withRpc({ data: [], error: null });

    await searchCatalog("frieren", [], 200);

    expect(rpc.mock.calls[0]).toEqual([
      "search_anime_catalog",
      expect.objectContaining({ max_results: 50 }),
    ]);
  });

  it("falls back to the substring match while 0030 isn't applied", async () => {
    const { builder } = withRpc(RPC_NOT_FOUND, [animeRow()]);

    const results = await searchCatalog("frieren");

    expect(results).toHaveLength(1);
    expect(builder.called("or")).toBe(true);
  });

  it("remembers a missing RPC instead of paying a round trip per search", async () => {
    const { rpc } = withRpc(RPC_NOT_FOUND, [animeRow()]);

    await searchCatalog("frieren");
    await searchCatalog("frieren");

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps asking after any other RPC error — only 'no such function' is remembered", async () => {
    const { rpc } = withRpc({ data: null, error: { code: "57014", message: "statement timeout" } });

    await searchCatalog("frieren");
    await searchCatalog("frieren");

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not trust a malformed RPC answer", async () => {
    const { builder } = withRpc({ data: { not: "an array" }, error: null }, [animeRow()]);

    expect(await searchCatalog("frieren")).toHaveLength(1);
    expect(builder.called("or")).toBe(true);
  });
});

describe("catalogRowToJikan", () => {
  it("carries the synced columns in Jikan's own fields", () => {
    const anime = catalogRowToJikan(
      animeRow({
        title_synonyms: ["Frieren at the Funeral"],
        members: 1_200_000,
        duration_mins: 24,
        banner_url: "https://s4.anilist.co/banner.jpg",
        trailer_youtube_id: "qgQ0G9tq0eI",
        broadcast_day: "Fridays",
        broadcast_time: "23:00",
        airing_start: "2023-09-29",
        airing_end: "2024-03-22",
      }),
    );

    expect(anime).toMatchObject({
      title_synonyms: ["Frieren at the Funeral"],
      members: 1_200_000,
      // What the banner's parseDurationMins and the info grid read.
      duration: "24 min per ep",
      banner_image: "https://s4.anilist.co/banner.jpg",
      broadcast: { day: "Fridays", time: "23:00", timezone: "Asia/Tokyo" },
      aired: { from: "2023-09-29", to: "2024-03-22" },
    });
    // trailerYoutubeId() reads youtube_id; the detail page embeds no-cookie.
    expect(anime.trailer).toEqual({
      youtube_id: "qgQ0G9tq0eI",
      url: "https://www.youtube.com/watch?v=qgQ0G9tq0eI",
      embed_url: "https://www.youtube-nocookie.com/embed/qgQ0G9tq0eI",
    });
  });

  it("leaves those fields absent on a row the sync never touched", () => {
    // Same as a sparse Jikan record: absent, not null, so `?? fallback` and
    // `"trailer" in a` checks downstream behave as they always did.
    const anime = catalogRowToJikan(animeRow());

    for (const key of ["title_synonyms", "members", "duration", "banner_image", "trailer", "broadcast", "aired"]) {
      expect(anime).not.toHaveProperty(key);
    }
  });
});

describe("searchAdultCatalog", () => {
  it.each([
    ["ecchi", ["Ecchi"]],
    ["hentai", ["Hentai"]],
    ["both", ["Ecchi", "Hentai"]],
  ])("matches %s rows by genre overlap", async (mode, names) => {
    const builder = withRows([animeRow()]);

    await searchAdultCatalog("", mode as "ecchi" | "hentai" | "both");

    expect(builder.argsOf("overlaps")).toEqual(["genres", names]);
  });

  it("defaults to both adult genres", async () => {
    const builder = withRows([animeRow()]);

    await searchAdultCatalog("");

    expect(builder.argsOf("overlaps")).toEqual(["genres", ["Ecchi", "Hentai"]]);
  });

  it("browses with no query, unlike the SFW search", async () => {
    // The misc tab has no safe default listing without this.
    withRows([animeRow()]);

    expect(await searchAdultCatalog("")).toHaveLength(1);
  });

  it("sanitizes the title filter the same way", async () => {
    const builder = withRows([]);

    await searchAdultCatalog("50% (x), y");

    const filter = String(builder.argsOf("or")?.[0]);
    expect(filter).not.toMatch(/[%(),]/.source.replace("%", "%"));
    expect(filter).toContain("ilike");
  });
});

describe("randomCatalogAnime", () => {
  it("returns null when the catalog is empty", async () => {
    withRows([], { count: 0 });

    expect(await randomCatalogAnime()).toBeNull();
  });

  it("returns a mapped row when one is found", async () => {
    withRows([animeRow()], { count: 1 });

    expect(await randomCatalogAnime()).toMatchObject({ mal_id: 52991 });
  });

  it("returns null when the range lands on nothing", async () => {
    withRows([], { count: 5 });

    expect(await randomCatalogAnime()).toBeNull();
  });

  it("picks an offset inside the row count", async () => {
    const builder = withRows([animeRow()], { count: 10 });
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    await randomCatalogAnime();

    expect(builder.argsOf("range")).toEqual([9, 9]);
  });

  it("excludes Hentai from the random roll, matching MAL's sfw=true", async () => {
    const builder = withRows([animeRow()], { count: 1 });

    await randomCatalogAnime();

    expect(builder.calls).toContainEqual({
      method: "not",
      args: ["genres", "cs", "{Hentai}"],
    });
  });
});
