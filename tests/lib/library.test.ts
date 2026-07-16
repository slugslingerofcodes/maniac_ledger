import { beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture } from "../helpers/fixtures";

/**
 * Adding an anime to the catalog and to a user's library.
 *
 * The interesting behaviour here is degradation. Migrations are applied by hand
 * (see CLAUDE.md), so this code is written to survive a schema that's one
 * migration behind: it retries without `genres` (0014) and without `is_private`
 * (0023), and it falls back to a plain read when the catalog UPDATE policy
 * isn't in place. Those paths only run against a half-migrated database, which
 * is precisely why they're worth testing here rather than discovering in prod.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/jikan", () => ({ getAnimeById: vi.fn() }));
vi.mock("@/lib/anilist", () => ({ getAnilistAnimeByMalId: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { getAnimeById } = await import("@/lib/jikan");
const { getAnilistAnimeByMalId } = await import("@/lib/anilist");
const { addToLibrary, upsertCatalogAnime, resolveAnimeIdByMalId } = await import(
  "@/lib/library"
);

const createClientMock = vi.mocked(createClient);
const getAnimeByIdMock = vi.mocked(getAnimeById);
const getAnilistByMalIdMock = vi.mocked(getAnilistAnimeByMalId);

type Result = { data?: unknown; error?: unknown };

/**
 * A Supabase stub where each table has a *queue* of results, consumed in order
 * by whatever terminates the chain (`single`, `maybeSingle`, or awaiting an
 * insert). Sequencing is the point: these functions retry the same table with a
 * different payload, so "first call fails, second succeeds" is the behaviour
 * under test.
 */
function client({
  user = { id: "user-1" } as { id: string } | null,
  authError = null as unknown,
  queues = {} as Record<string, Result[]>,
} = {}) {
  const writes: Record<string, unknown[]> = {};
  const builders: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  const builderFor = (table: string) => {
    const queue = [...(queues[table] ?? [])];
    writes[table] = [];
    const next = () => {
      const r = queue.shift() ?? {};
      return { data: null, error: null, ...r };
    };

    const builder: Record<string, unknown> = {
      single: vi.fn(() => Promise.resolve(next())),
      maybeSingle: vi.fn(() => Promise.resolve(next())),
      // Awaiting the chain (insert with no .select()) also consumes a result.
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve),
    };
    for (const m of ["select", "eq", "delete", "update"]) {
      builder[m] = vi.fn(() => builder);
    }
    for (const m of ["upsert", "insert"]) {
      builder[m] = vi.fn((payload: unknown) => {
        writes[table].push(payload);
        return builder;
      });
    }
    builders[table] = builder as Record<string, ReturnType<typeof vi.fn>>;
    return builder;
  };

  const cache: Record<string, unknown> = {};
  const supabase = {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: authError })),
    },
    from: vi.fn((table: string) => (cache[table] ??= builderFor(table))),
  };

  createClientMock.mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return { supabase, writes, builders };
}

/** PostgREST-style error. */
const dbError = (message: string, code?: string) => ({ message, code });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertCatalogAnime", () => {
  it("maps a Jikan record onto the catalog row", async () => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "anime-1" } }] } });

    const id = await upsertCatalogAnime(
      supabase as never,
      animeFixture({ mal_id: 52991, title: "Frieren" }),
    );

    expect(id).toBe("anime-1");
    expect(writes.anime[0]).toMatchObject({
      mal_id: 52991,
      title: "Frieren",
      total_episodes: 28,
      studio: "Madhouse",
      genres: ["Adventure"],
    });
  });

  it("dedupes the shared catalog by mal_id", async () => {
    const { supabase, builders } = client({ queues: { anime: [{ data: { id: "anime-1" } }] } });

    await upsertCatalogAnime(supabase as never, animeFixture());

    expect(builders.anime.upsert.mock.calls[0][1]).toEqual({ onConflict: "mal_id" });
  });

  it.each([
    ["Finished Airing", "finished_airing"],
    ["Currently Airing", "currently_airing"],
    ["Not yet aired", "not_yet_aired"],
  ])("maps airing status %s to the enum %s", async (jikan, expected) => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(supabase as never, animeFixture({ status: jikan }));

    expect(writes.anime[0]).toMatchObject({ status: expected });
  });

  it("falls back to finished_airing for an unrecognised status", async () => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(supabase as never, animeFixture({ status: "Some New State" }));

    expect(writes.anime[0]).toMatchObject({ status: "finished_airing" });
  });

  it("prefers the large poster", async () => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(supabase as never, animeFixture());

    expect(writes.anime[0]).toMatchObject({ poster_url: "https://cdn.example/poster-l.jpg" });
  });

  it("falls back to the standard poster", async () => {
    const images = {
      image_url: "https://cdn.example/p.jpg",
      small_image_url: null,
      large_image_url: null,
    };
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(
      supabase as never,
      animeFixture({ images: { jpg: images, webp: images } }),
    );

    expect(writes.anime[0]).toMatchObject({ poster_url: "https://cdn.example/p.jpg" });
  });

  it("stores genres as plain names", async () => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(
      supabase as never,
      animeFixture({
        genres: [
          { mal_id: 1, type: "anime", name: "Action", url: "" },
          { mal_id: 2, type: "anime", name: "Adventure", url: "" },
        ],
      }),
    );

    expect(writes.anime[0]).toMatchObject({ genres: ["Action", "Adventure"] });
  });

  it("tolerates a record with no studio", async () => {
    const { supabase, writes } = client({ queues: { anime: [{ data: { id: "a" } }] } });

    await upsertCatalogAnime(supabase as never, animeFixture({ studios: [] }));

    expect(writes.anime[0]).toMatchObject({ studio: null });
  });

  it("retries without genres when migration 0014 is not applied", async () => {
    // The add must keep working against a half-migrated schema; genres just
    // stay empty until the migration runs.
    const { supabase, writes } = client({
      queues: {
        anime: [
          { error: dbError("column anime.genres does not exist") },
          { data: { id: "anime-1" } },
        ],
      },
    });

    expect(await upsertCatalogAnime(supabase as never, animeFixture())).toBe("anime-1");
    expect(writes.anime[1]).not.toHaveProperty("genres");
    expect(writes.anime[1]).toMatchObject({ mal_id: 52991 });
  });

  it("reads the existing row when the catalog UPDATE policy blocks the refresh", async () => {
    // Already cataloged + no 0014 UPDATE policy ⇒ the upsert's conflict-update
    // is RLS-denied. The add only needs the id, so skip the metadata refresh.
    const { supabase } = client({
      queues: {
        anime: [
          { error: dbError("new row violates row-level security policy") },
          { data: { id: "existing-1" } },
        ],
      },
    });

    expect(await upsertCatalogAnime(supabase as never, animeFixture())).toBe("existing-1");
  });

  it("throws when the RLS fallback finds no existing row", async () => {
    const { supabase } = client({
      queues: {
        anime: [{ error: dbError("row-level security policy") }, { data: null }],
      },
    });

    await expect(upsertCatalogAnime(supabase as never, animeFixture())).rejects.toThrow(
      /row-level security/,
    );
  });

  it("throws on an unexpected database error", async () => {
    const { supabase } = client({
      queues: { anime: [{ error: dbError("connection reset") }] },
    });

    await expect(upsertCatalogAnime(supabase as never, animeFixture())).rejects.toThrow(
      "connection reset",
    );
  });

  it("throws when the upsert returns no row", async () => {
    const { supabase } = client({ queues: { anime: [{ data: null }] } });

    await expect(upsertCatalogAnime(supabase as never, animeFixture())).rejects.toThrow(
      /Could not save this anime/,
    );
  });
});

describe("addToLibrary", () => {
  it("refuses a signed-out caller", async () => {
    const { supabase } = client({ user: null });

    await expect(addToLibrary(animeFixture())).rejects.toThrow(/must be signed in/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses when the auth check itself errors", async () => {
    client({ user: null, authError: { message: "jwt expired" } });

    await expect(addToLibrary(animeFixture())).rejects.toThrow(/must be signed in/);
  });

  it("catalogs the anime and starts the user at plan_to_watch", async () => {
    const { writes } = client({
      queues: { anime: [{ data: { id: "anime-1" } }], user_progress: [{}] },
    });

    expect(await addToLibrary(animeFixture())).toEqual({ success: true, animeId: "anime-1" });
    expect(writes.user_progress[0]).toEqual({
      user_id: "user-1",
      anime_id: "anime-1",
      status: "plan_to_watch",
      episodes_watched: 0,
      is_private: false,
    });
  });

  it("flags a private add, keeping it off the feed and public profiles", async () => {
    const { writes } = client({
      queues: { anime: [{ data: { id: "anime-1" } }], user_progress: [{}] },
    });

    await addToLibrary(animeFixture(), { isPrivate: true });

    expect(writes.user_progress[0]).toMatchObject({ is_private: true });
  });

  it("reports an existing entry instead of throwing", async () => {
    // 23505 = unique (user_id, anime_id) violation.
    const { writes } = client({
      queues: {
        anime: [{ data: { id: "anime-1" } }],
        user_progress: [{ error: dbError("duplicate key value", "23505") }],
      },
    });

    expect(await addToLibrary(animeFixture())).toEqual({
      alreadyAdded: true,
      animeId: "anime-1",
    });
    expect(writes.user_progress).toHaveLength(1);
  });

  it("retries without is_private when migration 0023 is not applied", async () => {
    const { writes } = client({
      queues: {
        anime: [{ data: { id: "anime-1" } }],
        user_progress: [
          { error: dbError("column user_progress.is_private does not exist") },
          {},
        ],
      },
    });

    expect(await addToLibrary(animeFixture(), { isPrivate: true })).toEqual({
      success: true,
      animeId: "anime-1",
    });
    expect(writes.user_progress[1]).not.toHaveProperty("is_private");
    expect(writes.user_progress[1]).toMatchObject({ status: "plan_to_watch" });
  });

  it("still reports an existing entry when the 0023 retry hits the unique constraint", async () => {
    client({
      queues: {
        anime: [{ data: { id: "anime-1" } }],
        user_progress: [
          { error: dbError("column is_private does not exist") },
          { error: dbError("duplicate key value", "23505") },
        ],
      },
    });

    expect(await addToLibrary(animeFixture())).toEqual({
      alreadyAdded: true,
      animeId: "anime-1",
    });
  });

  it("throws on an unexpected progress error", async () => {
    client({
      queues: {
        anime: [{ data: { id: "anime-1" } }],
        user_progress: [{ error: dbError("deadlock detected", "40P01") }],
      },
    });

    await expect(addToLibrary(animeFixture())).rejects.toThrow("deadlock detected");
  });

  it("does not touch user_progress when cataloging fails", async () => {
    // No catalog row means no id to point a library entry at, so the write
    // must not be attempted at all.
    const { supabase } = client({
      queues: { anime: [{ error: dbError("catalog down") }], user_progress: [{}] },
    });

    await expect(addToLibrary(animeFixture())).rejects.toThrow("catalog down");
    expect(supabase.from).not.toHaveBeenCalledWith("user_progress");
  });
});

describe("resolveAnimeIdByMalId", () => {
  it("returns the catalog id when the anime is already known", async () => {
    client({ queues: { anime: [{ data: { id: "anime-1" } }] } });

    expect(await resolveAnimeIdByMalId(52991)).toBe("anime-1");
    expect(getAnimeByIdMock).not.toHaveBeenCalled();
  });

  it("backfills from Jikan when the anime is not cataloged yet", async () => {
    client({ queues: { anime: [{ data: null }, { data: { id: "anime-new" } }] } });
    getAnimeByIdMock.mockResolvedValue(animeFixture());

    expect(await resolveAnimeIdByMalId(52991)).toBe("anime-new");
    expect(getAnimeByIdMock).toHaveBeenCalledWith(52991);
  });

  it("backfills from AniList when Jikan is down", async () => {
    // Detail links from AniList-served results must keep opening during a MAL
    // outage — otherwise the fallback chain produces unclickable cards.
    client({ queues: { anime: [{ data: null }, { data: { id: "anime-new" } }] } });
    getAnimeByIdMock.mockRejectedValue(new Error("Jikan 504"));
    getAnilistByMalIdMock.mockResolvedValue(animeFixture());

    expect(await resolveAnimeIdByMalId(52991)).toBe("anime-new");
    expect(getAnilistByMalIdMock).toHaveBeenCalledWith(52991);
  });

  it("rethrows the original error when neither source knows the id", async () => {
    client({ queues: { anime: [{ data: null }] } });
    getAnimeByIdMock.mockRejectedValue(new Error("Jikan 404"));
    getAnilistByMalIdMock.mockResolvedValue(null);

    await expect(resolveAnimeIdByMalId(1)).rejects.toThrow("Jikan 404");
  });
});
