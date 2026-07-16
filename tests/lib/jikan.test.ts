import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, searchPayload } from "../helpers/fixtures";

/**
 * Covers the parts of `jikan.ts` that no typecheck can see: the process-local
 * TTL cache, in-flight de-duplication, negative caching, the serial rate-limit
 * queue, and last-good degradation during an upstream outage.
 *
 * Every test re-imports the module through `vi.resetModules()` because the
 * cache, the last-good map, and the rate-limit chain are module-level state —
 * without a reset, one test's cache entries would satisfy the next test's
 * fetches and the assertions would pass for the wrong reason.
 */

/** Fresh module instance + a mock `fetch`, with module state reset. */
async function loadJikan() {
  vi.resetModules();
  return import("@/lib/jikan");
}

/**
 * The queue spaces requests `MIN_REQUEST_INTERVAL_MS` (350ms) apart using real
 * `setTimeout`, so tests drive fake timers forward to let queued work run.
 * Generous slack: we assert on call counts, not on wake-up precision.
 */
async function drainQueue(ms = 5_000) {
  await vi.advanceTimersByTimeAsync(ms);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // The module logs outage/degradation paths; keep test output readable.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("response cache", () => {
  it("serves a repeat call from cache without a second fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await loadJikan();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;

    const second = searchAnime("frieren");
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has expired", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await loadJikan();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;

    // searchAnime caches for one hour; step just past it.
    vi.setSystemTime(Date.now() + 3_600_001);

    const second = searchAnime("frieren");
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent calls for the same path onto one request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { getTopAnime } = await loadJikan();

    // The home page asks for /top/anime twice in a single render (hero + rail).
    const both = Promise.all([getTopAnime(), getTopAnime()]);
    await drainQueue();
    const [a, b] = await both;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("caches by path, so different queries do not collide", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await loadJikan();

    const work = Promise.all([searchAnime("frieren"), searchAnime("bocchi")]);
    await drainQueue();
    await work;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache /random, so repeat rolls stay random", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: searchPayload().data[0] }));
    const { getRandomAnime } = await loadJikan();

    const first = getRandomAnime();
    await drainQueue();
    await first;

    const second = getRandomAnime();
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("negative caching", () => {
  it("fails fast for a minute instead of re-queueing a doomed call", async () => {
    // MAL down → Jikan 504s on every endpoint. Without negative caching the
    // home page re-queues ~20 doomed calls through the 350ms queue per load.
    fetchMock.mockResolvedValue(jsonResponse({ message: "gateway" }, 504));
    const { searchAnime, JikanError } = await loadJikan();

    const first = searchAnime("frieren").catch((e: unknown) => e);
    await drainQueue();
    expect(await first).toBeInstanceOf(JikanError);

    const second = searchAnime("frieren").catch((e: unknown) => e);
    await drainQueue();
    expect(await second).toBeInstanceOf(JikanError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once the failure TTL lapses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "gateway" }, 504));
    const { searchAnime } = await loadJikan();

    const first = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await first;

    // Failures are remembered for 60s so recovery is picked up quickly.
    vi.setSystemTime(Date.now() + 61_000);

    const second = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not negative-cache a 429, so the next caller may proceed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "rate limited" }, 429));
    const { searchAnime } = await loadJikan();

    const first = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await first;

    const second = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("last-good degradation", () => {
  it("serves the last successful payload when upstream goes down", async () => {
    const payload = searchPayload("Frieren");
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));
    const { searchAnime } = await loadJikan();

    const first = searchAnime("frieren");
    await drainQueue();
    expect(await first).toEqual(payload);

    // Past the TTL, so the cache can't be what answers the second call.
    vi.setSystemTime(Date.now() + 3_600_001);
    fetchMock.mockRejectedValue(new TypeError("network down"));

    const second = searchAnime("frieren");
    await drainQueue();

    // Degraded, not broken: same data, served stale.
    expect(await second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws rather than serving last-good on a 429", async () => {
    // A rate limit is a signal callers must see to back off — masking it with
    // stale data would hide the problem and keep us throttled.
    fetchMock.mockResolvedValueOnce(jsonResponse(searchPayload()));
    const { searchAnime, JikanError } = await loadJikan();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;

    vi.setSystemTime(Date.now() + 3_600_001);
    fetchMock.mockResolvedValue(jsonResponse({ message: "slow down" }, 429));

    const second = searchAnime("frieren").catch((e: unknown) => e);
    await drainQueue();

    const err = await second;
    expect(err).toBeInstanceOf(JikanError);
    expect((err as InstanceType<typeof JikanError>).status).toBe(429);
  });

  it("never serves a stale /random — a repeat is not a random roll", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: searchPayload().data[0] }),
    );
    const { getRandomAnime } = await loadJikan();

    const first = getRandomAnime();
    await drainQueue();
    await first;

    fetchMock.mockRejectedValue(new TypeError("network down"));
    const second = getRandomAnime().catch((e: unknown) => e);
    await drainQueue();

    expect(await second).toBeInstanceOf(TypeError);
  });

  it("propagates the error when there is no last-good copy", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const { searchAnime } = await loadJikan();

    const only = searchAnime("frieren").catch((e: unknown) => e);
    await drainQueue();

    expect(await only).toBeInstanceOf(TypeError);
  });
});

describe("errors", () => {
  it("surfaces the status and Jikan's JSON error message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "Resource does not exist" }, 404),
    );
    const { getAnimeById, JikanError } = await loadJikan();

    const call = getAnimeById(1).catch((e: unknown) => e);
    await drainQueue();
    const err = await call;

    expect(err).toBeInstanceOf(JikanError);
    expect((err as InstanceType<typeof JikanError>).status).toBe(404);
    expect((err as Error).message).toContain("Resource does not exist");
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: () => Promise.reject(new SyntaxError("not json")),
    });
    const { getAnimeById } = await loadJikan();

    const call = getAnimeById(1).catch((e: unknown) => e);
    await drainQueue();

    expect((await call as Error).message).toContain("Bad Gateway");
  });

  it("keeps the queue alive after a failure", async () => {
    // A rejected task must not wedge the serial chain for every later caller.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500))
      .mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime, getTopAnime } = await loadJikan();

    const failed = searchAnime("frieren").catch(() => "failed");
    await drainQueue();
    expect(await failed).toBe("failed");

    const after = getTopAnime();
    await drainQueue();
    await expect(after).resolves.toBeDefined();
  });
});

describe("rate limiting", () => {
  it("spaces distinct requests at least 350ms apart", async () => {
    const callTimes: number[] = [];
    fetchMock.mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(jsonResponse(searchPayload()));
    });
    const { searchAnime } = await loadJikan();

    const work = Promise.all([
      searchAnime("a-query"),
      searchAnime("b-query"),
      searchAnime("c-query"),
    ]);
    await drainQueue();
    await work;

    expect(callTimes).toHaveLength(3);
    for (let i = 1; i < callTimes.length; i++) {
      expect(callTimes[i] - callTimes[i - 1]).toBeGreaterThanOrEqual(350);
    }
  });

  it("does not make cache hits wait on the queue", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await loadJikan();

    // Let only the first request through: with `lastRequestAt` now ≈ the
    // current time, any *live* call would have to sleep out the 350ms gap.
    const first = searchAnime("frieren");
    await vi.advanceTimersByTimeAsync(0);
    await first;

    // So if this resolves with the clock frozen, it was served from cache and
    // never entered the queue — which is the whole point of caching here.
    await expect(searchAnime("frieren")).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

