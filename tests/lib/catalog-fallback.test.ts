import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tables } from "@/lib/database.types";
import { clientReturning, queryBuilder } from "../helpers/supabase";

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
const { searchCatalog, searchAdultCatalog, randomCatalogAnime } = await import(
  "@/lib/catalog-fallback"
);

const createClientMock = vi.mocked(createClient);

function animeRow(overrides: Partial<Tables<"anime">> = {}): Tables<"anime"> {
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

/** Point `createClient` at a builder resolving to `data`, and hand it back. */
function withRows(data: unknown, extra: { count?: number } = {}) {
  const builder = queryBuilder({ data, ...extra });
  createClientMock.mockResolvedValue(
    clientReturning(builder) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
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
