import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, searchPayload } from "../helpers/fixtures";

/**
 * The Jikan breaker across serverless instances.
 *
 * In production (Vercel, Fluid compute) the per-instance breaker in
 * `tests/lib/jikan-breaker.test.ts` rarely opened during a real outage, and
 * the logs said why. An instance is suspended once its last response is out,
 * so a Jikan call the search hedge had abandoned froze mid-timeout and only
 * failed when a later request woke the instance (one probe's 8s timeout was
 * recorded 4 minutes late). And instances are replaced all the time, each
 * starting closed. So every palette search kept paying the 1.2s hedge delay.
 *
 * Two mechanisms, pinned here:
 *  - every live call and probe is handed to `after()`, which keeps the
 *    instance up until it settles;
 *  - the breaker's verdict is written to the shared `http_cache` table and
 *    read by every instance, freshest evidence winning.
 *
 * `newInstance()` re-imports jikan (fresh module state = a new instance)
 * while the fake table below survives, as the real one does.
 */

const table = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/http-cache", () => ({
  sharedCacheGet: vi.fn(),
  sharedCacheSet: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

const { sharedCacheGet, sharedCacheSet } = await import("@/lib/http-cache");
const { after } = await import("next/server");
const getMock = vi.mocked(sharedCacheGet);
const setMock = vi.mocked(sharedCacheSet);
const afterMock = vi.mocked(after);

const VERDICT_KEY = "jikan:breaker";

async function tableGet(key: string) {
  return table.has(key)
    ? { value: table.get(key), expiresAt: Date.now() + 3_600_000 }
    : undefined;
}
async function tableSet(key: string, value: unknown) {
  table.set(key, value);
}

/** A new serverless instance: fresh module state, same shared table. */
async function newInstance() {
  vi.resetModules();
  return import("@/lib/jikan");
}

const connectionFailure = () => new TypeError("fetch failed");
const timeout = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  table.clear();
  getMock.mockImplementation(tableGet);
  setMock.mockImplementation(tableSet);
  afterMock.mockImplementation(() => {});
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Settle a call, draining the 350ms rate-limit queue in front of it. */
async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const caught = p.catch((e: unknown) => e as Error);
  await vi.advanceTimersByTimeAsync(2_000);
  return caught;
}

async function tripBreaker(searchAnime: (q: string) => Promise<unknown>) {
  fetchMock.mockRejectedValueOnce(connectionFailure());
  fetchMock.mockRejectedValueOnce(timeout());
  fetchMock.mockRejectedValueOnce(connectionFailure());
  for (const q of ["trip-a", "trip-b", "trip-c"]) await settle(searchAnime(q));
}

/** Every promise handed to `after()` so far, flagged as it settles. */
function keptAlive() {
  return afterMock.mock.calls.map(([task]) => {
    const entry = { settled: false, promise: task as Promise<unknown> };
    void entry.promise.then(() => (entry.settled = true));
    return entry;
  });
}

describe("publishing the verdict", () => {
  it("writes 'unreachable' to the shared table when the breaker opens", async () => {
    const { searchAnime } = await newInstance();
    await tripBreaker(searchAnime);

    const verdict = table.get(VERDICT_KEY) as Record<string, number>;
    expect(verdict).toMatchObject({ state: "open", cooldownMs: 30_000 });
    expect(verdict.openUntil - verdict.at).toBe(30_000);
    // Trusted far longer than the cool-down; failed probes keep rewriting it.
    expect(setMock).toHaveBeenCalledWith(VERDICT_KEY, verdict, 3_600);
  });

  it("writes the doubled cool-down when a probe fails", async () => {
    const { searchAnime } = await newInstance();
    await tripBreaker(searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    fetchMock.mockRejectedValue(connectionFailure());

    await settle(searchAnime("trigger"));

    expect(table.get(VERDICT_KEY)).toMatchObject({ state: "open", cooldownMs: 60_000 });
  });

  it("writes 'reachable' when its probe closes the breaker", async () => {
    const { searchAnime } = await newInstance();
    await tripBreaker(searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));

    await settle(searchAnime("trigger"));

    expect(table.get(VERDICT_KEY)).toEqual({ state: "closed", at: expect.any(Number) });
  });

  it("does not write on every response, only on a change", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await newInstance();

    for (const q of ["a", "b", "c"]) await settle(searchAnime(q));

    expect(setMock.mock.calls.filter(([key]) => key === VERDICT_KEY)).toEqual([]);
  });
});

describe("adopting another instance's verdict", () => {
  it("fails fast on a fresh instance, without touching the network", async () => {
    // Instance A meets the outage; B is a cold start that never has.
    const a = await newInstance();
    await tripBreaker(a.searchAnime);
    fetchMock.mockClear();
    const b = await newInstance();

    const call = b.searchAnime("one piece").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(b.JikanUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a lapsed cool-down as fail fast plus one background probe", async () => {
    // The row outlives the cool-down on purpose: an instance that finds it
    // late still knows not to make a reader wait for Jikan.
    const now = Date.now();
    table.set(VERDICT_KEY, {
      state: "open",
      at: now - 60_000,
      openUntil: now - 30_000,
      cooldownMs: 30_000,
    });
    fetchMock.mockImplementation(() => new Promise(() => {})); // still down
    const b = await newInstance();

    const call = b.searchAnime("late").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(b.JikanUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the probe, not the caller
  });

  it("ignores a verdict older than its own last response, and corrects the row", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Frieren")));
    const b = await newInstance();
    const heardAt = Date.now();
    await settle(b.searchAnime("frieren"));
    // Written by an instance that hadn't heard Jikan answer B since.
    table.set(VERDICT_KEY, {
      state: "open",
      at: heardAt - 1,
      openUntil: heardAt + 30_000,
      cooldownMs: 30_000,
    });
    await vi.advanceTimersByTimeAsync(5_000); // next read is due

    const res = await settle(b.searchAnime("naruto"));

    expect(res).toMatchObject({ data: [{ title: "Frieren" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(table.get(VERDICT_KEY)).toMatchObject({ state: "closed" });
  });

  it("closes an open breaker when a newer 'reachable' verdict lands", async () => {
    const b = await newInstance();
    await tripBreaker(b.searchAnime);
    // Another instance's probe got through after B's breaker opened.
    table.set(VERDICT_KEY, { state: "closed", at: Date.now() });
    await vi.advanceTimersByTimeAsync(5_000); // still inside B's 30s cool-down
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Back")));

    const res = await settle(b.searchAnime("next"));

    expect(res).toMatchObject({ data: [{ title: "Back" }] });
  });

  it("keeps its own newer outage evidence when it adopts a longer cool-down", async () => {
    const b = await newInstance();
    await tripBreaker(b.searchAnime);
    const openedHere = (table.get(VERDICT_KEY) as { at: number }).at;
    // An older "unreachable" from elsewhere, with a longer cool-down: adopted.
    table.set(VERDICT_KEY, {
      state: "open",
      at: openedHere - 2_000,
      openUntil: openedHere + 120_000,
      cooldownMs: 120_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await settle(b.searchAnime("adopt"));
    // "Reachable" as of a moment B has newer evidence against.
    table.set(VERDICT_KEY, { state: "closed", at: openedHere - 1_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    const call = b.searchAnime("still-down").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(b.JikanUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not let an old 'reachable' verdict reset a closed breaker's count", async () => {
    // The row can be an hour old. Re-read before each call (5s apart here),
    // it must not wipe failures that are newer than it.
    table.set(VERDICT_KEY, { state: "closed", at: Date.now() - 30 * 60_000 });
    const b = await newInstance();
    for (const q of ["c1", "c2", "c3"]) {
      fetchMock.mockRejectedValueOnce(connectionFailure());
      await settle(b.searchAnime(q));
      await vi.advanceTimersByTimeAsync(5_000);
    }

    const call = b.searchAnime("c4").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(b.JikanUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads the verdict at most once per 5s, not once per call", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const b = await newInstance();

    for (const q of ["r1", "r2", "r3", "r4"]) await settle(b.searchAnime(q));
    const verdictReads = () =>
      getMock.mock.calls.filter(([key]) => key === VERDICT_KEY).length;
    // Four calls over ~8s of fake time: a read at 0s and one at ~6s.
    expect(verdictReads()).toBe(2);
  });
});

describe("failing soft", () => {
  it("never holds a live call more than 250ms for the verdict", async () => {
    getMock.mockImplementation((key: string) =>
      key === VERDICT_KEY ? new Promise(() => {}) : tableGet(key),
    );
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Frieren")));
    const b = await newInstance();

    const call = b.searchAnime("frieren");
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(call).resolves.toMatchObject({ data: [{ title: "Frieren" }] });
  });

  it("charges a hung verdict read's 250ms once, not to every call after it", async () => {
    getMock.mockImplementation((key: string) =>
      key === VERDICT_KEY ? new Promise(() => {}) : tableGet(key),
    );
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const b = await newInstance();
    await settle(b.searchAnime("first")); // waited the 250ms

    // The read is still hanging, and the next one isn't due for 5s.
    void b.searchAnime("second");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the breaker working locally when the table is broken", async () => {
    getMock.mockRejectedValue(new Error("postgres down"));
    setMock.mockRejectedValue(new Error("postgres down"));
    const b = await newInstance();
    await tripBreaker(b.searchAnime);

    const call = b.searchAnime("one piece").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(b.JikanUnavailableError);
  });

  it.each([
    ["not an object", "open"],
    ["no timestamp", { state: "open", openUntil: Date.now() + 30_000, cooldownMs: 30_000 }],
    ["no cool-down", { state: "open", at: Date.now(), openUntil: Date.now() + 30_000 }],
    ["an unknown state", { state: "half-open", at: Date.now() }],
    ["a string time", { state: "open", at: "now", openUntil: "later", cooldownMs: 30_000 }],
  ])("ignores a row that is %s", async (_label, row) => {
    table.set(VERDICT_KEY, row);
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Frieren")));
    const b = await newInstance();

    const res = await settle(b.searchAnime("frieren"));

    expect(res).toMatchObject({ data: [{ title: "Frieren" }] });
  });
});

describe("keeping abandoned calls alive", () => {
  it("hands each live call to after(), which settles only when the call does", async () => {
    let failFetch!: (e: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => (failFetch = reject)));
    const b = await newInstance();

    // The caller walks away — exactly what the hedge does once AniList answers.
    void b.searchAnime("abandoned").catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const [kept] = keptAlive();
    expect(kept).toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(kept.settled).toBe(false); // in flight: the instance must stay up

    failFetch(timeout());
    await vi.advanceTimersByTimeAsync(0);

    expect(kept.settled).toBe(true);
    // Resolved, not rejected: after() would log a rejection as an app error.
    await expect(kept.promise).resolves.toBeUndefined();
  });

  it("keeps the background probe alive too", async () => {
    const b = await newInstance();
    await tripBreaker(b.searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    afterMock.mockClear();
    let failProbe!: (e: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => (failProbe = reject)));

    await settle(b.searchAnime("trigger")); // fails fast, starts the probe
    const pending = keptAlive();
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.some((k) => !k.settled)).toBe(true);

    failProbe(timeout());
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.every((k) => k.settled)).toBe(true);
  });

  it("keeps the verdict write alive until it lands", async () => {
    let finishWrite!: () => void;
    setMock.mockImplementation(
      (key, value) =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            table.set(key, value);
            resolve();
          };
        }),
    );
    const b = await newInstance();
    afterMock.mockClear();
    await tripBreaker(b.searchAnime);
    const kept = keptAlive();
    await vi.advanceTimersByTimeAsync(0);
    expect(kept.some((k) => !k.settled)).toBe(true);

    finishWrite();
    await vi.advanceTimersByTimeAsync(0);

    expect(kept.every((k) => k.settled)).toBe(true);
    expect(table.get(VERDICT_KEY)).toMatchObject({ state: "open" });
  });

  it("still answers outside a request scope, where after() throws", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Frieren")));
    const b = await newInstance();

    const res = await settle(b.searchAnime("frieren"));

    expect(res).toMatchObject({ data: [{ title: "Frieren" }] });
  });
});
