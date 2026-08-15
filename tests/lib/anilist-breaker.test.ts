import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AniList circuit breaker.
 *
 * AniList is the app's tier-2 engine — nearly every surface degrades to it when
 * MAL wobbles — and it can be *globally* out of service, answering every query
 * with `403 "The AniList API has been temporarily disabled due to severe
 * stability issues."` (observed in production).
 *
 * The response cache stores successes only, so in that state every fallback
 * path paid a full round-trip plus rate-limiter spacing to reach a guaranteed
 * failure, from several page sections at once: slow *and* broken, precisely
 * when the app was already degraded.
 *
 * The distinction these tests pin is the one a refactor is most likely to
 * flatten: **only a 403 trips the breaker.** That is the single status where
 * AniList explicitly says it has taken itself out of service. Widening it to
 * 5xx or 429 would disable the app's entire backup engine over one transient
 * error or ordinary backpressure — and would contradict
 * `anilist.test.ts`'s "keeps the queue alive after a failure", which pins a
 * lone 500 as recoverable.
 */

const QUERY = `query ($page: Int) { Page(page: $page) { media { id } } }`;

let fetchMock: ReturnType<typeof vi.fn>;

function stubStatus(status: number, message: string) {
  fetchMock = vi.fn(async () => ({
    ok: false,
    status,
    statusText: "err",
    json: async () => ({ errors: [{ message }] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Drive the module's internal fetch through its test-only export. */
async function caller() {
  const mod = await import("@/lib/anilist");
  mod.__resetAnilistCache();
  return mod.__anilistFetchForTests as unknown as (
    q: string,
    v: Record<string, unknown>,
  ) => Promise<unknown>;
}

describe("AniList circuit breaker", () => {
  it("stops calling the network after a 403 'API disabled'", async () => {
    stubStatus(403, "The AniList API has been temporarily disabled");
    const call = await caller();

    await expect(call(QUERY, { page: 1 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Every subsequent call short-circuits — no second request.
    await expect(call(QUERY, { page: 2 })).rejects.toThrow(/unavailable/i);
    await expect(call(QUERY, { page: 3 })).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT trip on a 5xx — one blip must not disable the backup engine", async () => {
    // Deliberately narrower than it first looks: a lone 500 is usually
    // transient, and `anilist.test.ts` ("keeps the queue alive after a
    // failure") pins that the next request must still be attempted.
    stubStatus(503, "upstream boom");
    const call = await caller();

    await expect(call(QUERY, { page: 1 })).rejects.toThrow();
    await expect(call(QUERY, { page: 2 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT trip on 429 — a rate limit means AniList is alive", async () => {
    // The branch worth guarding: treating backpressure as an outage would
    // disable the app's whole backup engine over ordinary throttling.
    stubStatus(429, "Too Many Requests");
    const call = await caller();

    await expect(call(QUERY, { page: 1 })).rejects.toThrow();
    await expect(call(QUERY, { page: 2 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT trip on a 4xx that isn't 403 — that's a bad query, not a dead service", async () => {
    stubStatus(400, "Bad Request");
    const call = await caller();

    await expect(call(QUERY, { page: 1 })).rejects.toThrow();
    await expect(call(QUERY, { page: 2 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("closes again after the cooldown elapses", async () => {
    vi.useFakeTimers();
    try {
      stubStatus(403, "disabled");
      const call = await caller();

      await expect(call(QUERY, { page: 1 })).rejects.toThrow();
      await expect(call(QUERY, { page: 2 })).rejects.toThrow(/unavailable/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Past the 5-minute cooldown the engine gets another chance, so recovery
      // is automatic rather than needing a redeploy.
      vi.advanceTimersByTime(5 * 60_000 + 1);
      await expect(call(QUERY, { page: 3 })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
