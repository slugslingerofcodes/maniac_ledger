import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Custom lists. Two behaviors worth pinning beyond auth guards: input
 * validation (a bad uuid must be refused before any query — PostgREST throws
 * on malformed uuids) and the append-at-end position math in addToList.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { createList, deleteList, setListPublic, addToList, removeFromList } =
  await import("@/app/actions/lists");

const createClientMock = vi.mocked(createClient);

const LIST_ID = "11111111-1111-4111-8111-111111111111";
const ANIME_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Chainable stub. `lastPosition` feeds addToList's max-position lookup;
 * writes record their payloads on `writes`.
 */
function client({
  user = { id: "user-1" } as { id: string } | null,
  lastPosition = null as number | null,
  error = null as { message: string } | null,
} = {}) {
  const writes: Record<string, unknown[]> = { insert: [], upsert: [], update: [] };
  const builder: Record<string, unknown> = {
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: lastPosition == null ? null : { position: lastPosition },
        error: null,
      }),
    ),
    single: vi.fn(() => Promise.resolve({ data: { id: LIST_ID }, error })),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error }).then(resolve),
  };
  for (const m of ["select", "eq", "order", "limit", "delete"]) {
    builder[m] = vi.fn(() => builder);
  }
  for (const m of ["insert", "upsert", "update"]) {
    builder[m] = vi.fn((payload: unknown) => {
      writes[m].push(payload);
      return builder;
    });
  }
  const from = vi.fn(() => builder);
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user } })) },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { writes, from, builder };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createList", () => {
  it("refuses an empty name before touching the database", async () => {
    const { from } = client();

    expect(await createList("   ")).toEqual({ ok: false, error: "Give the list a name." });
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses an overlong name", async () => {
    client();

    expect((await createList("x".repeat(81))).ok).toBe(false);
  });

  it("refuses a signed-out caller", async () => {
    client({ user: null });

    expect(await createList("Favorites")).toEqual({ ok: false, error: "Sign in to create lists." });
  });

  it("creates the list and returns its id", async () => {
    const { writes } = client();

    const res = await createList("  Favorites  ", "  the best  ");

    expect(res).toEqual({ ok: true, listId: LIST_ID });
    expect(writes.insert[0]).toEqual({
      user_id: "user-1",
      name: "Favorites",
      description: "the best",
    });
  });

  it("stores a blank description as null, not an empty string", async () => {
    const { writes } = client();

    await createList("Favorites", "   ");

    expect(writes.insert[0]).toMatchObject({ description: null });
  });
});

describe("uuid validation", () => {
  it.each([
    ["deleteList", () => deleteList("not-a-uuid")],
    ["setListPublic", () => setListPublic("not-a-uuid", true)],
    ["addToList (list)", () => addToList("not-a-uuid", ANIME_ID)],
    ["addToList (anime)", () => addToList(LIST_ID, "not-a-uuid")],
    ["removeFromList", () => removeFromList("not-a-uuid", ANIME_ID)],
  ])("%s refuses a malformed uuid before any query", async (_name, call) => {
    const { from } = client();

    const res = await call();

    expect(res.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("addToList", () => {
  it("appends at the end: next position is max + 1", async () => {
    const { writes } = client({ lastPosition: 4 });

    await addToList(LIST_ID, ANIME_ID);

    expect(writes.upsert[0]).toMatchObject({ position: 5 });
  });

  it("starts an empty list at position 0", async () => {
    const { writes } = client({ lastPosition: null });

    await addToList(LIST_ID, ANIME_ID);

    expect(writes.upsert[0]).toMatchObject({ position: 0 });
  });

  it("ignores duplicates, so re-adding is a no-op instead of an error", async () => {
    const { builder } = client();

    await addToList(LIST_ID, ANIME_ID);

    expect(
      (builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({ onConflict: "list_id,anime_id", ignoreDuplicates: true });
  });
});

describe("failure reporting", () => {
  it("surfaces the database error", async () => {
    client({ error: { message: "permission denied" } });

    expect(await deleteList(LIST_ID)).toEqual({ ok: false, error: "permission denied" });
  });
});
