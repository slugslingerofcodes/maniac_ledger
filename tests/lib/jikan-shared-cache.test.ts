import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, searchPayload } from "../helpers/fixtures";

/**
 * How `jikanFetch` stacks its three tiers: memory → shared `http_cache` →
 * Jikan.
 *
 * The point of the shared tier is cold starts. `tests/lib/jikan.test.ts` covers
 * the memory tier with the shared one disabled (no service key), which is the
 * "not configured" path; this file mocks the shared tier so a *cold* instance
 * with a warm table is reproducible — the exact scenario that was costing ~48s.
 */

vi.mock("@/lib/http-cache", () => ({
  sharedCacheGet: vi.fn(),
  sharedCacheSet: vi.fn(() => Promise.resolve()),
}));

const { sharedCacheGet, sharedCacheSet } = await import("@/lib/http-cache");
const sharedGetMock = vi.mocked(sharedCacheGet);
const sharedSetMock = vi.mocked(sharedCacheSet);

/** A cold instance: fresh module state, so the memory tier is empty. */
async function coldStart() {
  vi.resetModules();
  return import("@/lib/jikan");
}

async function drainQueue(ms = 5_000) {
  await vi.advanceTimersByTimeAsync(ms);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  sharedGetMock.mockResolvedValue(undefined);
  sharedSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("cold start with a warm table", () => {
  it("serves from the shared cache without calling Jikan", async () => {
    // The whole point: a new serverless instance pays one Postgres query
    // instead of a queued Jikan fetch.
    const payload = searchPayload("Frieren");
    sharedGetMock.mockResolvedValue({
      value: payload,
      expiresAt: Date.now() + 3_600_000,
    });
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren");
    await drainQueue();

    expect(await call).toEqual(payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks the entry up under a namespaced key", async () => {
    // Other clients will share this table, so keys can't collide.
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { getTopAnime } = await coldStart();

    const call = getTopAnime();
    await drainQueue();
    await call;

    expect(sharedGetMock.mock.calls[0][0]).toBe("jikan:/top/anime?filter=airing&limit=24");
  });

  it("promotes a shared hit into memory, so the next read is free", async () => {
    sharedGetMock.mockResolvedValue({
      value: searchPayload(),
      expiresAt: Date.now() + 3_600_000,
    });
    const { searchAnime } = await coldStart();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;

    const second = searchAnime("frieren");
    await drainQueue();
    await second;

    expect(sharedGetMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never holds a promoted entry past the shared row's own expiry", async () => {
    // The row expires in 5s but searchAnime's TTL is an hour. Taking the
    // longer of the two would keep serving data the shared tier has retired.
    sharedGetMock.mockResolvedValue({
      value: searchPayload(),
      expiresAt: Date.now() + 5_000,
    });
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;

    // Past the row's expiry, the memory copy must be gone too.
    sharedGetMock.mockResolvedValue(undefined);
    vi.setSystemTime(Date.now() + 6_000);

    const second = searchAnime("frieren");
    await drainQueue();
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes one shared lookup for concurrent callers, not one each", async () => {
    sharedGetMock.mockResolvedValue({
      value: searchPayload(),
      expiresAt: Date.now() + 3_600_000,
    });
    const { getTopAnime } = await coldStart();

    const both = Promise.all([getTopAnime(), getTopAnime()]);
    await drainQueue();
    await both;

    expect(sharedGetMock).toHaveBeenCalledTimes(1);
  });
});

describe("populating the shared cache", () => {
  it("writes a fresh response back for the next cold start", async () => {
    const payload = searchPayload();
    fetchMock.mockResolvedValue(jsonResponse(payload));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren");
    await drainQueue();
    await call;

    expect(sharedSetMock).toHaveBeenCalledWith(
      "jikan:/anime?sfw=true&page=1&q=frieren",
      payload,
      3_600,
    );
  });

  it("passes the caller's TTL through", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { getTopAnime } = await coldStart();

    const call = getTopAnime();
    await drainQueue();
    await call;

    // getTopAnime caches for a day.
    expect(sharedSetMock.mock.calls[0][2]).toBe(86_400);
  });

  it("does not block the response on the cache write", async () => {
    // A slow Postgres must not slow down the page.
    let release!: () => void;
    sharedSetMock.mockReturnValue(new Promise<void>((r) => (release = r)));
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren");
    await drainQueue();

    await expect(call).resolves.toBeDefined();
    release();
  });

  it("still answers when the cache write rejects", async () => {
    sharedSetMock.mockRejectedValue(new Error("cache table gone"));
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren");
    await drainQueue();

    await expect(call).resolves.toBeDefined();
  });

  it("does not write a failed response to the shared cache", async () => {
    // Negative caching is per-instance and short-lived on purpose; persisting
    // an outage would outlive the outage.
    fetchMock.mockResolvedValue(jsonResponse({ message: "gateway" }, 504));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await call;

    expect(sharedSetMock).not.toHaveBeenCalled();
  });

  it("does not consult or populate the shared cache for /random", async () => {
    // A "random" served from cache isn't random.
    fetchMock.mockResolvedValue(jsonResponse({ data: searchPayload().data[0] }));
    const { getRandomAnime } = await coldStart();

    const call = getRandomAnime();
    await drainQueue();
    await call;

    expect(sharedGetMock).not.toHaveBeenCalled();
    expect(sharedSetMock).not.toHaveBeenCalled();
  });
});

describe("when the shared tier is unavailable", () => {
  it("falls through to Jikan when the lookup misses", async () => {
    sharedGetMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren");
    await drainQueue();

    await expect(call).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still serves the page when the lookup itself rejects", async () => {
    // http-cache swallows its own errors, but jikan must not depend on that.
    sharedGetMock.mockRejectedValue(new Error("postgres down"));
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const call = searchAnime("frieren").catch((e: unknown) => e);
    await drainQueue();

    // Degraded to the network, not broken.
    expect(await call).not.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers memory over the shared tier, skipping the round trip entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchPayload()));
    const { searchAnime } = await coldStart();

    const first = searchAnime("frieren");
    await drainQueue();
    await first;
    sharedGetMock.mockClear();

    const second = searchAnime("frieren");
    await drainQueue();
    await second;

    expect(sharedGetMock).not.toHaveBeenCalled();
  });

  it("does not consult the shared tier while a failure is negative-cached", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "gateway" }, 504));
    const { searchAnime } = await coldStart();

    const first = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await first;
    sharedGetMock.mockClear();

    const second = searchAnime("frieren").catch(() => null);
    await drainQueue();
    await second;

    expect(sharedGetMock).not.toHaveBeenCalled();
  });
});
