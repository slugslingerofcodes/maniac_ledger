import { describe, expect, it } from "vitest";

import { animeFixture } from "../helpers/fixtures";

/**
 * Jikan → catalog row mapping for the seeder.
 *
 * The seed writes straight into the shared `anime` table with the service-role
 * key, so a mapping mistake here is not a rendering bug — it is bad data
 * persisted for every user, and several columns are **Postgres enums**: one
 * unmapped value rejects the whole batch. The cases below are the ones Jikan
 * actually returns that don't map one-to-one.
 */

const { toCatalogRow } = await import("@/lib/catalog-seed");

describe("toCatalogRow", () => {
  it("maps a full record into the catalog shape", () => {
    const row = toCatalogRow(
      animeFixture({
        mal_id: 52991,
        title: "Sousou no Frieren",
        title_english: "Frieren: Beyond Journey's End",
        score: 9.26,
        episodes: 28,
        status: "Finished Airing",
        type: "TV",
        year: 2023,
      }),
    );

    expect(row).toMatchObject({
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren: Beyond Journey's End",
      score: 9.26,
      total_episodes: 28,
      status: "finished_airing",
      type: "tv",
      year: 2023,
    });
  });

  it("drops records with no mal_id — the catalog dedupes and links on it", () => {
    expect(
      toCatalogRow(animeFixture({ mal_id: undefined as unknown as number })),
    ).toBeNull();
  });

  it("drops records with no title rather than writing a blank card", () => {
    expect(toCatalogRow(animeFixture({ title: "" }))).toBeNull();
  });

  it("omits `type` for kinds the enum has no member for", () => {
    // Jikan returns "CM" and "PV". `anime_type` has no catch-all, so setting
    // one would fail the batch; omitting lets the column default apply.
    const row = toCatalogRow(animeFixture({ type: "PV" }));
    expect(row).not.toBeNull();
    expect(row!.type).toBeUndefined();
  });

  it('maps "TV Special" to the `special` member, not `tv`', () => {
    expect(toCatalogRow(animeFixture({ type: "TV Special" }))!.type).toBe(
      "special",
    );
  });

  it("parses Jikan's prose ratings down to the enum", () => {
    const rate = (rating: string) =>
      toCatalogRow({ ...animeFixture({}), rating })!.rating;

    expect(rate("PG-13 - Teens 13 or older")).toBe("pg_13");
    expect(rate("R - 17+ (violence & profanity)")).toBe("r_17");
    expect(rate("R+ - Mild Nudity")).toBe("r_plus");
    expect(rate("G - All Ages")).toBe("g");
    expect(rate("Rx - Hentai")).toBe("rx");
  });

  it("nulls a rating it doesn't recognise instead of guessing", () => {
    expect(toCatalogRow({ ...animeFixture({}), rating: "???" })!.rating).toBeNull();
  });

  it("defaults an unknown airing status to finished rather than failing", () => {
    expect(toCatalogRow(animeFixture({ status: "Who knows" }))!.status).toBe(
      "finished_airing",
    );
  });

  it("only accepts the four real seasons", () => {
    expect(toCatalogRow(animeFixture({ season: "summer" }))!.season).toBe("summer");
    expect(
      toCatalogRow(animeFixture({ season: "monsoon" as never }))!.season,
    ).toBeNull();
  });

  it("always produces a genres array, never null", () => {
    // The column is `string[]` and several queries use array operators on it
    // (`cs`, `overlaps`); a null would break them.
    const row = toCatalogRow(animeFixture({ genres: undefined as never }));
    expect(row!.genres).toEqual([]);
  });
});
