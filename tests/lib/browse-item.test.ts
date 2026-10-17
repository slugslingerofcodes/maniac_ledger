import { describe, expect, it, vi } from "vitest";

import { animeFixture } from "../helpers/fixtures";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { toBrowseItem, toJikanAnime, trailerYoutubeId } = await import("@/lib/browse-item");
const { upsertCatalogAnime } = await import("@/lib/library");

/**
 * Home-page cards add titles to the library from the data they were rendered
 * with: `toBrowseItem` on the server, `toJikanAnime` back on the client, then
 * the existing `addToLibraryAction`. The catalog upsert *overwrites* on
 * conflict, so anything this round trip drops is erased from the shared
 * catalog for every user — a null synopsis, an empty genre list (which also
 * blinds "Because you watched"), a missing studio. Pin it against what the
 * upsert actually writes, not against a list of fields that could go stale.
 */

/** The catalog row `upsertCatalogAnime` would write for `anime`. */
async function upsertRowFor(anime: Parameters<typeof upsertCatalogAnime>[1]) {
  let written: unknown;
  const supabase = {
    from: () => ({
      upsert: (row: unknown) => {
        written = row;
        return { select: () => ({ single: async () => ({ data: { id: "uuid" }, error: null }) }) };
      },
    }),
  };
  await upsertCatalogAnime(supabase as never, anime);
  return written;
}

describe("browse item round trip", () => {
  it("writes the same catalog row as the original record", async () => {
    const original = animeFixture({
      genres: [
        { mal_id: 2, type: "anime", name: "Adventure", url: "" },
        { mal_id: 8, type: "anime", name: "Drama", url: "" },
      ],
      status: "Currently Airing",
    });

    const roundTripped = toJikanAnime(toBrowseItem(original));

    expect(await upsertRowFor(roundTripped)).toEqual(await upsertRowFor(original));
  });

  it("survives a record with sparse fields", async () => {
    const sparse = animeFixture({
      title_english: null,
      synopsis: null,
      episodes: null,
      score: null,
      year: null,
      genres: [],
      studios: [],
    });

    expect(await upsertRowFor(toJikanAnime(toBrowseItem(sparse)))).toEqual(
      await upsertRowFor(sparse),
    );
  });
});

describe("trailerYoutubeId", () => {
  it("prefers the explicit id", () => {
    const a = animeFixture({ trailer: { youtube_id: "abc123XYZ", url: null, embed_url: null } });
    expect(trailerYoutubeId(a)).toBe("abc123XYZ");
  });

  it("reads the id out of an embed URL when MAL leaves youtube_id null", () => {
    const a = animeFixture({
      trailer: {
        youtube_id: null,
        url: null,
        embed_url: "https://www.youtube-nocookie.com/embed/Q1w2E3r4T5y?enablejsapi=1&autoplay=1",
      },
    });
    expect(trailerYoutubeId(a)).toBe("Q1w2E3r4T5y");
  });

  it("is null without a trailer (AniList-served records)", () => {
    expect(trailerYoutubeId(animeFixture())).toBeNull();
  });
});
