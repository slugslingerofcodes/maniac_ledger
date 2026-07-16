import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The write paths for episode/anime progress.
 *
 * RLS is the real access boundary here (see CLAUDE.md), so these tests don't
 * try to prove authorization — Postgres does that. What they pin is the app's
 * side of the contract: that a signed-out caller is refused before any write,
 * that `user_id` is still set explicitly where an onConflict target needs it,
 * that the Zod patch refuses unknown columns, and that the right paths get
 * revalidated (miss one and the UI silently shows stale progress).
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { revalidatePath } = await import("next/cache");
const { toggleEpisode, markEpisodesUpTo, upsertProgress, incrementRewatch } =
  await import("@/app/actions/progress");

const createClientMock = vi.mocked(createClient);
const revalidateMock = vi.mocked(revalidatePath);

const USER = { id: "user-1" };

/**
 * A Supabase client stub. Each table gets its own thenable builder, so a test
 * can assert on what was written to `episode_progress` while `episodes`
 * resolves the lookup rows.
 */
function client({
  user = USER as { id: string } | null,
  tables = {} as Record<string, unknown>,
} = {}) {
  const spies: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  const builderFor = (table: string) => {
    const result = (tables[table] ?? { data: null, error: null }) as Record<string, unknown>;
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    const builder: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, ...result }).then(resolve),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null, ...result })),
    };
    for (const m of ["select", "upsert", "delete", "update", "insert", "eq", "lte", "order"]) {
      calls[m] = vi.fn(() => builder);
      builder[m] = calls[m];
    }
    calls.maybeSingle = builder.maybeSingle as ReturnType<typeof vi.fn>;
    spies[table] = calls;
    return builder;
  };

  const builders: Record<string, unknown> = {};
  const supabase = {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user } })) },
    from: vi.fn((table: string) => (builders[table] ??= builderFor(table))),
  };

  createClientMock.mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  // Touch each table up front so `spies` is populated for assertions, then
  // forget those calls — tests assert on what the *action* did, and a
  // "never touched the DB" assertion has to mean exactly that.
  for (const t of Object.keys(tables)) supabase.from(t);
  supabase.from.mockClear();
  return { supabase, spies };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toggleEpisode", () => {
  it("refuses a signed-out caller", async () => {
    const { supabase } = client({ user: null });

    const res = await toggleEpisode("ep-1", true);

    expect(res).toEqual({ ok: false, error: "You must be signed in to track episodes." });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("marks an episode watched", async () => {
    const { spies } = client({ tables: { episode_progress: {}, episodes: {} } });

    expect(await toggleEpisode("ep-1", true)).toEqual({ ok: true, watched: true });
    expect(spies.episode_progress.upsert).toHaveBeenCalled();
  });

  it("sets user_id explicitly, which the onConflict target needs", async () => {
    // RLS scopes reads, but the (user_id, episode_id) conflict target can't
    // resolve without the column being written.
    const { spies } = client({ tables: { episode_progress: {}, episodes: {} } });

    await toggleEpisode("ep-1", true);

    expect(spies.episode_progress.upsert.mock.calls[0][0]).toEqual({
      user_id: "user-1",
      episode_id: "ep-1",
    });
  });

  it("ignores duplicates so re-marking is a no-op", async () => {
    const { spies } = client({ tables: { episode_progress: {}, episodes: {} } });

    await toggleEpisode("ep-1", true);

    expect(spies.episode_progress.upsert.mock.calls[0][1]).toMatchObject({
      onConflict: "user_id,episode_id",
      ignoreDuplicates: true,
    });
  });

  it("deletes the row when unmarking", async () => {
    const { spies } = client({ tables: { episode_progress: {}, episodes: {} } });

    expect(await toggleEpisode("ep-1", false)).toEqual({ ok: true, watched: false });
    expect(spies.episode_progress.delete).toHaveBeenCalled();
    expect(spies.episode_progress.upsert).not.toHaveBeenCalled();
  });

  it("scopes the delete to this user's row", async () => {
    const { spies } = client({ tables: { episode_progress: {}, episodes: {} } });

    await toggleEpisode("ep-1", false);

    expect(spies.episode_progress.eq.mock.calls).toEqual([
      ["user_id", "user-1"],
      ["episode_id", "ep-1"],
    ]);
  });

  it("reports a write failure instead of claiming success", async () => {
    const { spies } = client({
      tables: { episode_progress: { error: { message: "insert failed" } }, episodes: {} },
    });

    expect(await toggleEpisode("ep-1", true)).toEqual({ ok: false, error: "insert failed" });
    expect(spies.episodes?.select).not.toHaveBeenCalled();
  });

  it("does not revalidate when the write failed", async () => {
    client({ tables: { episode_progress: { error: { message: "nope" } }, episodes: {} } });

    await toggleEpisode("ep-1", true);

    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("revalidates the detail page it resolved from the episode", async () => {
    client({
      tables: { episode_progress: {}, episodes: { data: { anime_id: "anime-9" } } },
    });

    await toggleEpisode("ep-1", true);

    expect(revalidateMock).toHaveBeenCalledWith("/anime/anime-9");
    expect(revalidateMock).toHaveBeenCalledWith("/library");
  });

  it("still revalidates the library when the anime can't be resolved", async () => {
    client({ tables: { episode_progress: {}, episodes: { data: null } } });

    await toggleEpisode("ep-1", true);

    expect(revalidateMock).toHaveBeenCalledExactlyOnceWith("/library");
  });
});

describe("markEpisodesUpTo", () => {
  it("refuses a signed-out caller", async () => {
    client({ user: null });

    expect(await markEpisodesUpTo("ep-7")).toMatchObject({ ok: false });
  });

  it("reports a missing episode", async () => {
    client({ tables: { episodes: { data: null } } });

    expect(await markEpisodesUpTo("ep-7")).toEqual({ ok: false, error: "Episode not found." });
  });

  it("marks every episode up to and including the target", async () => {
    // Checking episode 7 fills in 1–6: you can't watch 7 without them.
    const { spies } = client({
      tables: {
        episodes: { data: { anime_id: "anime-9", number: 7 } },
        episode_progress: {},
      },
    });
    spies.episodes.maybeSingle.mockResolvedValue({
      data: { anime_id: "anime-9", number: 7 },
      error: null,
    });
    spies.episodes.lte.mockReturnValue({
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({
          data: [{ id: "ep-1" }, { id: "ep-2" }, { id: "ep-7" }],
          error: null,
        }).then(r),
    });

    const res = await markEpisodesUpTo("ep-7");

    expect(res).toEqual({ ok: true, watched: true });
    expect(spies.episode_progress.upsert.mock.calls[0][0]).toEqual([
      { user_id: "user-1", episode_id: "ep-1" },
      { user_id: "user-1", episode_id: "ep-2" },
      { user_id: "user-1", episode_id: "ep-7" },
    ]);
  });

  it("bounds the fill by episode number, not insertion order", async () => {
    const { spies } = client({
      tables: {
        episodes: { data: { anime_id: "anime-9", number: 7 } },
        episode_progress: {},
      },
    });
    spies.episodes.maybeSingle.mockResolvedValue({
      data: { anime_id: "anime-9", number: 7 },
      error: null,
    });
    spies.episodes.lte.mockReturnValue({
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    });

    await markEpisodesUpTo("ep-7");

    expect(spies.episodes.eq).toHaveBeenCalledWith("anime_id", "anime-9");
    expect(spies.episodes.lte).toHaveBeenCalledWith("number", 7);
  });

  it("skips the write when there is nothing to mark", async () => {
    const { spies } = client({
      tables: {
        episodes: { data: { anime_id: "anime-9", number: 1 } },
        episode_progress: {},
      },
    });
    spies.episodes.maybeSingle.mockResolvedValue({
      data: { anime_id: "anime-9", number: 1 },
      error: null,
    });
    spies.episodes.lte.mockReturnValue({
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    });

    expect(await markEpisodesUpTo("ep-1")).toEqual({ ok: true, watched: true });
    expect(spies.episode_progress.upsert).not.toHaveBeenCalled();
  });
});

describe("upsertProgress", () => {
  it("refuses an unknown column, so a malformed patch can't write arbitrary data", async () => {
    // `.strict()` is the boundary: the client sends this patch verbatim.
    const { supabase } = client({ tables: { user_progress: {} } });

    const res = await upsertProgress("anime-1", {
      is_admin: true,
    } as unknown as Parameters<typeof upsertProgress>[1]);

    expect(res).toEqual({ ok: false, error: "Invalid progress update." });
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["a score above 10", { score: 11 }],
    ["a score below 1", { score: 0 }],
    ["a fractional score", { score: 7.5 }],
    ["a negative episode count", { episodes_watched: -1 }],
    ["an unknown status", { status: "binging" }],
    ["an overlong note", { notes: "x".repeat(2001) }],
  ])("rejects %s", async (_label, patch) => {
    client({ tables: { user_progress: {} } });

    const res = await upsertProgress(
      "anime-1",
      patch as unknown as Parameters<typeof upsertProgress>[1],
    );

    expect(res).toEqual({ ok: false, error: "Invalid progress update." });
  });

  it.each([
    ["clearing a score", { score: null }],
    ["clearing notes", { notes: null }],
    ["zero episodes watched", { episodes_watched: 0 }],
    ["a valid status", { status: "watching" as const }],
    ["an empty patch", {}],
  ])("accepts %s", async (_label, patch) => {
    client({ tables: { user_progress: {} } });

    expect(await upsertProgress("anime-1", patch)).toEqual({ ok: true });
  });

  it("refuses a signed-out caller", async () => {
    const { supabase } = client({ user: null, tables: { user_progress: {} } });

    expect(await upsertProgress("anime-1", { score: 9 })).toMatchObject({ ok: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("upserts on the user/anime pair, so the first call adds and later ones edit", async () => {
    const { spies } = client({ tables: { user_progress: {} } });

    await upsertProgress("anime-1", { score: 9 });

    expect(spies.user_progress.upsert.mock.calls[0][0]).toEqual({
      user_id: "user-1",
      anime_id: "anime-1",
      score: 9,
    });
    expect(spies.user_progress.upsert.mock.calls[0][1]).toEqual({
      onConflict: "user_id,anime_id",
    });
  });

  it("writes only the fields the caller sent", async () => {
    // Upsert must leave unspecified columns untouched, or editing a score
    // would wipe the user's notes.
    const { spies } = client({ tables: { user_progress: {} } });

    await upsertProgress("anime-1", { status: "completed" });

    expect(spies.user_progress.upsert.mock.calls[0][0]).not.toHaveProperty("score");
    expect(spies.user_progress.upsert.mock.calls[0][0]).not.toHaveProperty("notes");
  });

  it("reports a write failure", async () => {
    client({ tables: { user_progress: { error: { message: "constraint violated" } } } });

    expect(await upsertProgress("anime-1", { score: 9 })).toEqual({
      ok: false,
      error: "constraint violated",
    });
  });

  it("revalidates the detail page, the library and the home page", async () => {
    client({ tables: { user_progress: {} } });

    await upsertProgress("anime-1", { score: 9 });

    expect(revalidateMock.mock.calls.map(([p]) => p)).toEqual([
      "/anime/anime-1",
      "/library",
      "/",
    ]);
  });
});

describe("incrementRewatch", () => {
  it("degrades gracefully when the entry has no rewatch row", async () => {
    // Migration 0017 may not be applied; the UI hides the control rather than
    // erroring.
    client({ tables: { user_progress: { data: null } } });

    expect(await incrementRewatch("anime-1")).toEqual({
      ok: false,
      error: "Rewatch tracking isn't available yet.",
    });
  });

  it("counts a first rewatch from a null count", async () => {
    const { spies } = client({ tables: { user_progress: { data: { rewatch_count: null } } } });

    await incrementRewatch("anime-1");

    expect(spies.user_progress.update).toHaveBeenCalledWith({
      rewatch_count: 1,
      status: "completed",
    });
  });

  it("increments an existing count and re-marks it completed", async () => {
    const { spies } = client({ tables: { user_progress: { data: { rewatch_count: 2 } } } });

    expect(await incrementRewatch("anime-1")).toEqual({ ok: true });
    expect(spies.user_progress.update).toHaveBeenCalledWith({
      rewatch_count: 3,
      status: "completed",
    });
  });

  it("refuses a signed-out caller", async () => {
    client({ user: null, tables: { user_progress: {} } });

    expect(await incrementRewatch("anime-1")).toMatchObject({ ok: false });
  });
});
