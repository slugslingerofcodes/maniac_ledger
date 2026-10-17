import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientReturning, queryBuilder } from "../helpers/supabase";

/**
 * The server actions behind the calendar subscription link: mint/rotate,
 * revoke, and "is one on?".
 *
 * The properties worth pinning are the ones a happy-path click never shows:
 *  - only a hash of the token is stored, so a database read (a leaked backup, a
 *    future over-broad RLS policy like 0015's) yields no working feed URLs;
 *  - every read and write is scoped to the signed-in user, explicitly;
 *  - a signed-out POST — actions are reachable from any route — writes nothing.
 */

const USER = { id: "user-1" };
const TOKEN_PATH = /^\/api\/calendar\/feed\/([A-Za-z0-9_-]{43})\.ics$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

const { rotateCalendarFeed, revokeCalendarFeed, getCalendarFeedStatus } = await import(
  "@/app/actions/calendar-feed"
);

let builder: ReturnType<typeof queryBuilder>;
let client: ReturnType<typeof clientReturning> & {
  auth: { getUser: ReturnType<typeof vi.fn> };
};

function signInAs(
  user: { id: string } | null,
  result: { data?: unknown; error?: unknown } = { data: null, error: null },
) {
  builder = queryBuilder(result);
  client = {
    ...clientReturning(builder),
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  };
  createClientMock.mockResolvedValue(client);
}

const ORIGINAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  signInAs(USER);
});

afterEach(() => {
  if (ORIGINAL_SERVICE_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_KEY;
});

describe("rotateCalendarFeed", () => {
  it("refuses a signed-out caller without touching the database", async () => {
    signInAs(null);

    const result = await rotateCalendarFeed();

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns a feed path carrying a 32-byte base64url token", async () => {
    const result = await rotateCalendarFeed();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toMatch(TOKEN_PATH);
  });

  it("stores the SHA-256 of the token — never the token itself", async () => {
    const result = await rotateCalendarFeed();
    if (!result.ok) throw new Error("expected ok");
    const token = TOKEN_PATH.exec(result.path)![1];

    expect(client.from).toHaveBeenCalledWith("calendar_feeds");
    const [row, options] = builder.argsOf("upsert")!;
    expect(row).toMatchObject({ user_id: "user-1", token_hash: sha256(token) });
    expect(options).toEqual({ onConflict: "user_id" });
    expect(JSON.stringify(builder.calls)).not.toContain(token);
  });

  it("writes the row for whichever user is signed in", async () => {
    signInAs({ id: "user-2" });

    await rotateCalendarFeed();

    expect(builder.argsOf("upsert")![0]).toMatchObject({ user_id: "user-2" });
  });

  it("mints a different token every time, so rotating kills the old link", async () => {
    const first = await rotateCalendarFeed();
    const second = await rotateCalendarFeed();

    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(first.path).not.toBe(second.path);
  });

  it("returns no link when the write fails", async () => {
    signInAs(USER, { error: { message: 'relation "public.calendar_feeds" does not exist' } });

    const result = await rotateCalendarFeed();

    expect(result).toEqual({ ok: false, error: "Couldn't create a calendar link. Try again later." });
  });
});

describe("revokeCalendarFeed", () => {
  it("refuses a signed-out caller without touching the database", async () => {
    signInAs(null);

    const result = await revokeCalendarFeed();

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("deletes only the signed-in user's feed", async () => {
    const result = await revokeCalendarFeed();

    expect(result).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith("calendar_feeds");
    expect(builder.called("delete")).toBe(true);
    expect(builder.calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
  });

  it("reports a failed delete", async () => {
    signInAs(USER, { error: { message: "boom" } });

    const result = await revokeCalendarFeed();

    expect(result).toEqual({ ok: false, error: "Couldn't turn off the calendar link. Try again later." });
  });
});

describe("getCalendarFeedStatus", () => {
  it("is unavailable to a signed-out caller, without a query", async () => {
    signInAs(null);

    expect(await getCalendarFeedStatus()).toEqual({ available: false, active: false });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("is unavailable when the service-role key isn't set — the feed route couldn't serve the link", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(await getCalendarFeedStatus()).toEqual({ available: false, active: false });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("is unavailable when the table can't be read (migration 0028 not applied)", async () => {
    signInAs(USER, { error: { message: 'relation "public.calendar_feeds" does not exist' } });

    expect(await getCalendarFeedStatus()).toEqual({ available: false, active: false });
  });

  it("reports an active feed, reading only the signed-in user's row", async () => {
    signInAs(USER, { data: { user_id: "user-1" } });

    expect(await getCalendarFeedStatus()).toEqual({ available: true, active: true });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(builder.called("maybeSingle")).toBe(true);
  });

  it("reports no feed", async () => {
    signInAs(USER, { data: null });

    expect(await getCalendarFeedStatus()).toEqual({ available: true, active: false });
  });

  it("never selects the token hash — the page has no use for it", async () => {
    signInAs(USER, { data: { user_id: "user-1" } });

    await getCalendarFeedStatus();

    expect(String(builder.argsOf("select")?.[0])).not.toMatch(/token_hash/);
  });
});
