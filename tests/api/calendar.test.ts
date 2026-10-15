import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { animeFixture } from "../helpers/fixtures";
import { clientReturning, queryBuilder } from "../helpers/supabase";

/**
 * GET /api/calendar — the signed-in user's Watching list as an .ics file.
 *
 * Three things here can go wrong silently:
 *  - the library read. Migration 0015 made every public profile's
 *    `user_progress` readable, so a query without `eq("user_id", …)` exports
 *    strangers' shows into *your* calendar. Nothing errors; the file is just
 *    wrong.
 *  - the schedule fallback (Jikan → AniList), which only runs during an
 *    upstream outage.
 *  - the join: only the user's shows that are actually airing, under the title
 *    they know them by — not the whole airing grid.
 */

const USER = { id: "user-1" };

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
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
const { GET } = await import("@/app/api/calendar/route");

const jikanMock = vi.mocked(getAiringSchedule);
const anilistMock = vi.mocked(getAnilistAiringSchedule);

// Wednesday 2026-10-14 12:00 JST.
const NOW = new Date("2026-10-14T03:00:00Z");

let builder: ReturnType<typeof queryBuilder>;
let client: ReturnType<typeof clientReturning> & {
  auth: { getUser: ReturnType<typeof vi.fn> };
};

/** A Supabase client signed in as `user` (or signed out for null). */
function signInAs(user: { id: string } | null, rows: unknown = [], error: unknown = null) {
  builder = queryBuilder({ data: rows, error });
  client = {
    ...clientReturning(builder),
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  };
  createClientMock.mockResolvedValue(client);
}

/** A `user_progress` row with its embedded catalog anime. */
function watching(malId: number, title: string) {
  return { anime: { mal_id: malId, title } };
}

/** A schedule entry as both Jikan and the AniList fallback return it. */
function airing(malId: number, day: string | null, time: string | null, title = `Schedule ${malId}`) {
  return animeFixture({
    mal_id: malId,
    title,
    status: "Currently Airing",
    broadcast: { day, time, timezone: "Asia/Tokyo", string: `${day} at ${time} (JST)` },
  });
}

/** Undo RFC 5545 folding and split into logical lines. */
function contentLines(ics: string) {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

function uids(ics: string) {
  return contentLines(ics)
    .filter((l) => l.startsWith("UID:"))
    .map((l) => l.slice("UID:".length));
}

function summaries(ics: string) {
  return contentLines(ics)
    .filter((l) => l.startsWith("SUMMARY:"))
    .map((l) => l.slice("SUMMARY:".length));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Only Date: the route has no timers, and faking those would hang awaits.
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  // The limiter's window map is module state; no test may inherit counts.
  resetRateLimit();
  signInAs(USER, [watching(52991, "Frieren")]);
  jikanMock.mockResolvedValue([airing(52991, "Fridays", "23:00")]);
  anilistMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("auth", () => {
  it("401s a signed-out request without reading the library or any upstream", async () => {
    signInAs(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(client.from).not.toHaveBeenCalled();
    expect(jikanMock).not.toHaveBeenCalled();
    expect(anilistMock).not.toHaveBeenCalled();
  });
});

describe("library query", () => {
  it("scopes the read to the signed-in user (migration 0015 regression guard)", async () => {
    await GET();

    expect(client.from).toHaveBeenCalledWith("user_progress");
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
  });

  it("scopes to whichever user is signed in, not a fixed id", async () => {
    signInAs({ id: "user-2" }, [watching(52991, "Frieren")]);

    await GET();

    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["user_id", "user-2"] });
    expect(eqCalls).not.toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
  });

  it("reads only Watching entries", async () => {
    await GET();

    expect(builder.calls).toContainEqual({ method: "eq", args: ["status", "watching"] });
  });

  it("selects the MAL id and title through the anime embed", async () => {
    await GET();

    expect(String(builder.argsOf("select")?.[0])).toMatch(
      /anime:anime_id\s*\(\s*mal_id\s*,\s*title\s*\)/,
    );
  });

  it("500s with the database message when the query fails", async () => {
    signInAs(USER, null, { message: "relation \"user_progress\" does not exist" });

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "relation \"user_progress\" does not exist" });
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("returns an empty calendar without touching Jikan when nothing is being watched", async () => {
    signInAs(USER, []);

    const res = await GET();
    const ics = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(contentLines(ics)[0]).toBe("BEGIN:VCALENDAR");
    expect(contentLines(ics)).not.toContain("BEGIN:VEVENT");
    expect(jikanMock).not.toHaveBeenCalled();
    expect(anilistMock).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("allows 5 exports a minute per user, then 429s with Retry-After", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await GET()).status).toBe(200);
    }

    const limited = await GET();

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Calendar was requested too recently. Please wait a moment.",
    });
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("rejects before calling the airing schedule upstream", async () => {
    for (let i = 0; i < 5; i++) await GET();
    jikanMock.mockClear();

    await GET();

    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("limits per user — one user's exports don't lock out another", async () => {
    for (let i = 0; i < 6; i++) await GET();

    signInAs({ id: "user-2" }, [watching(52991, "Frieren")]);

    expect((await GET()).status).toBe(200);
  });

  it("opens a fresh window after a minute", async () => {
    for (let i = 0; i < 6; i++) await GET();

    vi.setSystemTime(NOW.getTime() + 60_000);

    expect((await GET()).status).toBe(200);
  });
});

describe("schedule fallback", () => {
  it("uses Jikan when it answers, without calling AniList", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(uids(await res.text())).toEqual(["mal-52991@anime-maniacs"]);
    expect(anilistMock).not.toHaveBeenCalled();
  });

  it("falls back to AniList when Jikan throws", async () => {
    jikanMock.mockRejectedValue(new Error("504 gateway"));
    anilistMock.mockResolvedValue([airing(52991, "Fridays", "23:00")]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(anilistMock).toHaveBeenCalledTimes(1);
    expect(uids(await res.text())).toEqual(["mal-52991@anime-maniacs"]);
  });

  it("503s when both schedules are down", async () => {
    jikanMock.mockRejectedValue(new Error("504 gateway"));
    anilistMock.mockRejectedValue(new Error("500 boom"));

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The airing schedule is unavailable right now." });
  });
});

describe("matching the library to the schedule", () => {
  it("emits only the user's shows that are airing, matched by MAL id", async () => {
    signInAs(USER, [watching(1, "Mine, airing"), watching(2, "Mine, finished")]);
    jikanMock.mockResolvedValue([
      airing(1, "Mondays", "22:00"),
      airing(3, "Tuesdays", "22:00", "Someone else's show"),
    ]);

    const ics = await (await GET()).text();

    // Show 2 isn't on the schedule; show 3 isn't in the library.
    expect(uids(ics)).toEqual(["mal-1@anime-maniacs"]);
  });

  it("titles events with the library's title, not the schedule's", async () => {
    signInAs(USER, [watching(52991, "Frieren: Beyond Journey's End")]);
    jikanMock.mockResolvedValue([airing(52991, "Fridays", "23:00", "Sousou no Frieren 2nd Season")]);

    const ics = await (await GET()).text();

    expect(summaries(ics)).toEqual(["Frieren: Beyond Journey's End"]);
  });

  it.each([
    ["no broadcast at all", animeFixture({ mal_id: 52991, broadcast: undefined })],
    ["no broadcast day", airing(52991, null, "23:00")],
    ["no broadcast time", airing(52991, "Fridays", null)],
  ])("emits no event for a show with %s", async (_name, entry) => {
    jikanMock.mockResolvedValue([entry]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(contentLines(await res.text())).not.toContain("BEGIN:VEVENT");
  });

  it("schedules from the current time in JST", async () => {
    // Clock is Wednesday 12:00 JST → the next Friday 23:00 JST is the 16th.
    const lines = contentLines(await (await GET()).text());

    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20261016T230000");
    expect(lines).toContain("DTSTAMP:20261014T030000Z");
  });
});

describe("response", () => {
  it("serves an uncached .ics attachment", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="anime-maniacs-airing.ics"',
    );
    // Per-user data: never let an edge or browser cache hand it to someone else.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a well-formed calendar body", async () => {
    const ics = await (await GET()).text();

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});
