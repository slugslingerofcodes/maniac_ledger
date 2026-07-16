import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Air-date reminders. The interesting behavior is that one action is a
 * *toggle*: what it does depends on what's already in the table, and getting
 * the branch wrong double-books or silently un-books a reminder.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { revalidatePath } = await import("next/cache");
const { toggleNotify } = await import("@/app/actions/notifications");

const createClientMock = vi.mocked(createClient);
const revalidateMock = vi.mocked(revalidatePath);

const INPUT = {
  malId: 52991,
  animeTitle: "Frieren",
  posterUrl: "https://cdn.example/p.jpg",
  scheduledDate: "2026-10-04",
};

/** Supabase stub: `existing` controls the toggle branch. */
function client({
  user = { id: "user-1" } as { id: string } | null,
  existing = null as { id: string } | null,
  writeError = null as { message: string } | null,
} = {}) {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn(() => Promise.resolve({ error: writeError })),
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: existing, error: null })),
  };
  const builder: Record<string, unknown> = { ...calls };
  // select/eq/delete chain back to the builder; the terminals resolve.
  calls.select.mockReturnValue(builder);
  calls.eq.mockImplementation(() => builder);
  calls.delete.mockReturnValue(builder);
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error: writeError }).then(resolve);

  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user } })) },
    from: vi.fn(() => builder),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toggleNotify", () => {
  it("refuses a signed-out caller", async () => {
    client({ user: null });

    expect(await toggleNotify(INPUT)).toEqual({
      ok: false,
      error: "You must be signed in to set reminders.",
    });
  });

  it("subscribes when no reminder exists", async () => {
    const calls = client({ existing: null });

    const res = await toggleNotify(INPUT);

    expect(res).toEqual({ ok: true, notifying: true });
    expect(calls.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      mal_id: 52991,
      anime_title: "Frieren",
      poster_url: "https://cdn.example/p.jpg",
      scheduled_date: "2026-10-04",
      notified_at: null,
    });
  });

  it("unsubscribes when a reminder already exists", async () => {
    const calls = client({ existing: { id: "notif-1" } });

    const res = await toggleNotify(INPUT);

    expect(res).toEqual({ ok: true, notifying: false });
    expect(calls.delete).toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it("denormalizes title and poster onto the row, so the digest needs no lookup", async () => {
    const calls = client();

    await toggleNotify({ ...INPUT, posterUrl: null, scheduledDate: null });

    expect(calls.insert.mock.calls[0][0]).toMatchObject({
      anime_title: "Frieren",
      poster_url: null,
      scheduled_date: null,
    });
  });

  it("reports a write failure instead of claiming success", async () => {
    client({ writeError: { message: "insert failed" } });

    expect(await toggleNotify(INPUT)).toEqual({ ok: false, error: "insert failed" });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("revalidates /upcoming after either direction of the toggle", async () => {
    client({ existing: { id: "notif-1" } });
    await toggleNotify(INPUT);
    expect(revalidateMock).toHaveBeenCalledWith("/upcoming");

    revalidateMock.mockClear();
    client({ existing: null });
    await toggleNotify(INPUT);
    expect(revalidateMock).toHaveBeenCalledWith("/upcoming");
  });
});
