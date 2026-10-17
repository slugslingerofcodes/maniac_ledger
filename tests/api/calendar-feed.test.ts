import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture } from "../helpers/fixtures";
import { fakeDb } from "../helpers/supabase";

/**
 * GET /api/calendar/feed/<token>.ics — the live subscription feed.
 *
 * A calendar app fetches this on its own schedule, with no cookies, so the
 * token in the URL is the only credential and the service-role client (which
 * bypasses RLS) does the reads. That makes every scoping filter in this route
 * load-bearing in a way it isn't in the cookie route: nothing underneath it
 * stops a query that forgets `user_id` from returning everyone's library. The
 * fake database here behaves the same way — an unfiltered read returns every
 * user's rows — so a missing filter fails these tests instead of passing on a
 * mock that only ever held the right rows.
 */

const ALICE = "user-alice";
const BOB = "user-bob";

// 43 base64url characters = 32 random bytes, the shape the action mints.
const ALICE_TOKEN = "A".repeat(42) + "a";
const BOB_TOKEN = "b".repeat(42) + "_";
const UNKNOWN_TOKEN = "z".repeat(43);

/** Independent of the implementation's hashing — this is the oracle. */
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const createAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));
// The feed must never depend on a session: a calendar app has none.
const cookieClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => cookieClientMock(),
}));
vi.mock("@/lib/jikan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jikan")>();
  return { ...actual, getAiringSchedule: vi.fn() };
});
vi.mock("@/lib/anilist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anilist")>();
  return { ...actual, getAnilistAiringSchedule: vi.fn() };
});

const { getAiringSchedule } = await import("@/lib/jikan");
const { getAnilistAiringSchedule } = await import("@/lib/anilist");
const { resetRateLimit } = await import("@/lib/rate-limit");
const { GET } = await import("@/app/api/calendar/feed/[token]/route");

const jikanMock = vi.mocked(getAiringSchedule);
const anilistMock = vi.mocked(getAnilistAiringSchedule);

// Wednesday 2026-10-14 12:00 JST.
const NOW = new Date("2026-10-14T03:00:00Z");

let db: ReturnType<typeof fakeDb>;

/** A `user_progress` row as the fake stores it (filter columns + embed). */
function progress(userId: string, malId: number, title: string, opts: { status?: string; isPrivate?: boolean } = {}) {
  return {
    user_id: userId,
    status: opts.status ?? "watching",
    is_private: opts.isPrivate ?? false,
    anime: { mal_id: malId, title },
  };
}

function airing(malId: number, day = "Fridays", time = "23:00") {
  return animeFixture({
    mal_id: malId,
    title: `Schedule ${malId}`,
    status: "Currently Airing",
    broadcast: { day, time, timezone: "Asia/Tokyo", string: `${day} at ${time} (JST)` },
  });
}

/** Alice and Bob both have feeds and both watch something that's airing. */
function seed(overrides: Partial<Record<string, Record<string, unknown>[]>> = {}, errors: Record<string, unknown> = {}) {
  db = fakeDb(
    {
      calendar_feeds: [
        { user_id: ALICE, token_hash: sha256(ALICE_TOKEN) },
        { user_id: BOB, token_hash: sha256(BOB_TOKEN) },
      ],
      user_progress: [
        progress(ALICE, 1, "Alice's show"),
        progress(BOB, 2, "Bob's show"),
      ],
      ...overrides,
    },
    errors,
  );
  createAdminClientMock.mockReturnValue({ from: db.from });
}

function get(segment: string) {
  return GET(new Request(`https://app.test/api/calendar/feed/${segment}`), {
    params: Promise.resolve({ token: segment }),
  });
}

function contentLines(ics: string) {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

function uids(ics: string) {
  return contentLines(ics)
    .filter((l) => l.startsWith("UID:"))
    .map((l) => l.slice("UID:".length));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  resetRateLimit();
  seed();
  jikanMock.mockResolvedValue([airing(1), airing(2), airing(3)]);
  anilistMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("token → owner", () => {
  it("serves the token owner's Watching shows", async () => {
    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(200);
    expect(uids(await res.text())).toEqual(["mal-1@anime-maniacs"]);
  });

  it("never includes another user's shows, in either direction", async () => {
    const alice = uids(await (await get(`${ALICE_TOKEN}.ics`)).text());
    const bob = uids(await (await get(`${BOB_TOKEN}.ics`)).text());

    expect(alice).toEqual(["mal-1@anime-maniacs"]);
    expect(bob).toEqual(["mal-2@anime-maniacs"]);
  });

  it("filters the library on the owner's user_id explicitly (the service client bypasses RLS)", async () => {
    await get(`${ALICE_TOKEN}.ics`);

    const [library] = db.queries.user_progress;
    expect(library.calls).toContainEqual({ method: "eq", args: ["user_id", ALICE] });
  });

  it("looks the token up by its SHA-256 hash and never sends the raw token to the database", async () => {
    await get(`${ALICE_TOKEN}.ics`);

    const [lookup] = db.queries.calendar_feeds;
    expect(lookup.calls).toContainEqual({ method: "eq", args: ["token_hash", sha256(ALICE_TOKEN)] });
    const everything = JSON.stringify(
      Object.values(db.queries).flatMap((qs) => qs.map((q) => q.calls)),
    );
    expect(everything).not.toContain(ALICE_TOKEN);
  });

  it("reads only Watching entries", async () => {
    seed({
      user_progress: [
        progress(ALICE, 1, "Watching"),
        progress(ALICE, 3, "Finished but still airing", { status: "completed" }),
      ],
    });

    const ics = await (await get(`${ALICE_TOKEN}.ics`)).text();

    expect(uids(ics)).toEqual(["mal-1@anime-maniacs"]);
  });

  it("leaves private entries out — a feed URL is a link anyone holding it can read", async () => {
    seed({
      user_progress: [
        progress(ALICE, 1, "Public"),
        progress(ALICE, 3, "Private", { isPrivate: true }),
      ],
    });

    const ics = await (await get(`${ALICE_TOKEN}.ics`)).text();

    expect(uids(ics)).toEqual(["mal-1@anime-maniacs"]);
  });

  it("never touches the cookie-based client", async () => {
    await get(`${ALICE_TOKEN}.ics`);

    expect(cookieClientMock).not.toHaveBeenCalled();
  });

  it("accepts the token with or without the .ics suffix", async () => {
    expect((await get(ALICE_TOKEN)).status).toBe(200);
    expect((await get(`${ALICE_TOKEN}.ics`)).status).toBe(200);
  });
});

describe("unknown and malformed tokens", () => {
  it("404s a well-formed token that matches no feed, without reading any library or upstream", async () => {
    const res = await get(`${UNKNOWN_TOKEN}.ics`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Calendar feed not found." });
    expect(db.queries.user_progress).toBeUndefined();
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("404s a revoked token the same way", async () => {
    seed({ calendar_feeds: [{ user_id: BOB, token_hash: sha256(BOB_TOKEN) }] });

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(404);
    expect(db.queries.user_progress).toBeUndefined();
  });

  it.each([
    ["empty", ""],
    ["just the suffix", ".ics"],
    ["too short", `${"a".repeat(42)}.ics`],
    ["too long", `${"a".repeat(44)}.ics`],
    ["non-base64url characters", `${"a".repeat(42)}+.ics`],
    ["a path separator", `${"a".repeat(42)}/.ics`],
    ["a doubled suffix", `${ALICE_TOKEN}.ics.ics`],
    ["a different extension", `${ALICE_TOKEN}.txt`],
    ["the raw hash instead of the token", `${sha256(ALICE_TOKEN)}.ics`],
  ])("404s a token that is %s, before any database work", async (_name, segment) => {
    const res = await get(segment);

    expect(res.status).toBe(404);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("allows 10 fetches per token per 10 minutes, then 429s with Retry-After", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await get(`${ALICE_TOKEN}.ics`)).status).toBe(200);
    }

    const limited = await get(`${ALICE_TOKEN}.ics`);

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects before the database or the schedule upstream is touched", async () => {
    for (let i = 0; i < 10; i++) await get(`${ALICE_TOKEN}.ics`);
    createAdminClientMock.mockClear();
    jikanMock.mockClear();

    await get(`${ALICE_TOKEN}.ics`);

    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("limits per token — one feed being hammered doesn't lock out another", async () => {
    for (let i = 0; i < 11; i++) await get(`${ALICE_TOKEN}.ics`);

    expect((await get(`${BOB_TOKEN}.ics`)).status).toBe(200);
  });

  it("counts the token the same with or without the suffix", async () => {
    for (let i = 0; i < 10; i++) await get(ALICE_TOKEN);

    expect((await get(`${ALICE_TOKEN}.ics`)).status).toBe(429);
  });

  it("opens a fresh window after 10 minutes", async () => {
    for (let i = 0; i < 11; i++) await get(`${ALICE_TOKEN}.ics`);

    vi.setSystemTime(NOW.getTime() + 10 * 60_000);

    expect((await get(`${ALICE_TOKEN}.ics`)).status).toBe(200);
  });
});

describe("failure modes", () => {
  it("503s without leaking config details when the service-role key isn't set", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    });

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Calendar feed is unavailable right now." });
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("500s with a generic message when the token lookup fails", async () => {
    seed({}, { calendar_feeds: { message: 'relation "public.calendar_feeds" does not exist' } });

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Calendar feed is unavailable right now." });
  });

  it("500s with a generic message — not the database's — when the library read fails", async () => {
    seed({}, { user_progress: { message: 'permission denied for table user_progress' } });

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Calendar feed is unavailable right now." });
  });

  it("falls back to AniList when Jikan throws", async () => {
    jikanMock.mockRejectedValue(new Error("504 gateway"));
    anilistMock.mockResolvedValue([airing(1)]);

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(200);
    expect(uids(await res.text())).toEqual(["mal-1@anime-maniacs"]);
  });

  it("503s when both schedules are down", async () => {
    jikanMock.mockRejectedValue(new Error("504 gateway"));
    anilistMock.mockRejectedValue(new Error("500 boom"));

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The airing schedule is unavailable right now." });
  });

  it("serves an empty calendar without calling upstream when nothing is being watched", async () => {
    seed({ user_progress: [progress(BOB, 2, "Bob's show")] });

    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.status).toBe(200);
    expect(contentLines(await res.text())).not.toContain("BEGIN:VEVENT");
    expect(jikanMock).not.toHaveBeenCalled();
  });
});

describe("response", () => {
  it("is an uncached text/calendar body", async () => {
    const res = await get(`${ALICE_TOKEN}.ics`);

    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    // Per-user data behind a bearer URL: no shared cache may keep a copy.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("tells calendar apps how often to refresh", async () => {
    const lines = contentLines(await (await get(`${ALICE_TOKEN}.ics`)).text());

    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT6H");
  });

  it("schedules from the current time in JST, like the download", async () => {
    const lines = contentLines(await (await get(`${ALICE_TOKEN}.ics`)).text());

    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20261016T230000");
  });
});
