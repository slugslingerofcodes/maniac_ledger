import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Throughput of the upstream rate limiter.
 *
 * The home page needs ~15 distinct Jikan paths on a cold cache. The limiter
 * used to chain each request on the *completion* of the previous one, so wall
 * time was Σ(interval + latency) rather than the N × interval the rate limit
 * actually demands — roughly 12s instead of 5s at 500ms upstream latency, and
 * the reason a cold home page crawled.
 *
 * Measured on fake timers, so it is deterministic: no network, no real clock.
 * Note the clock must be read *inside* the promise chain — advanceTimersByTime
 * moves Date.now() by the full amount asked for, so reading it afterwards
 * measures the advance, not the work.
 */

const INTERVAL = 350;
const LATENCY = 500;

/** Mock upstream: every call resolves LATENCY ms after it starts. */
function stubFetch(starts?: number[]) {
  const t0 = Date.now();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      starts?.push(Date.now() - t0);
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: [], pagination: {} }),
            }),
          LATENCY,
        );
      });
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  // Module-level limiter state must not leak between tests (see CLAUDE.md).
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("upstream rate limiter", () => {
  it("overlaps in-flight requests instead of serialising on completion", async () => {
    const REQUESTS = 15;
    stubFetch();
    const { searchAnime } = await import("@/lib/jikan");

    const t0 = Date.now();
    let finishedAt = -1;
    const all = Promise.all(
      Array.from({ length: REQUESTS }, (_, i) => searchAnime(`q${i}`, 1)),
    ).then(() => {
      finishedAt = Date.now() - t0;
    });

    await vi.advanceTimersByTimeAsync(REQUESTS * (INTERVAL + LATENCY) + 1000);
    await all;

    // Slot-reserved: the last request starts at (N-1) × INTERVAL, then pays
    // one latency. Completion-chained would be ~N × (INTERVAL + LATENCY).
    const overlapped = (REQUESTS - 1) * INTERVAL + LATENCY; // 5400
    const chained = REQUESTS * (INTERVAL + LATENCY); // 12750

    expect(finishedAt).toBeGreaterThan(0);
    expect(finishedAt).toBeLessThanOrEqual(overlapped + INTERVAL);
    expect(finishedAt).toBeLessThan(chained / 2);
  });

  it("still never starts two requests inside one interval", async () => {
    const starts: number[] = [];
    stubFetch(starts);
    const { searchAnime } = await import("@/lib/jikan");

    const all = Promise.all(
      Array.from({ length: 6 }, (_, i) => searchAnime(`r${i}`, 1)),
    );
    await vi.advanceTimersByTimeAsync(6 * (INTERVAL + LATENCY) + 1000);
    await all;

    // The rate cap is the point of the limiter: it must survive the throughput
    // change, or we have simply traded slowness for 429s. Gaps should sit *at*
    // the interval — proving both that the cap holds and that requests are no
    // longer waiting out each other's latency.
    const gaps = starts.slice(1).map((t, i) => t - starts[i]!);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(INTERVAL);
      expect(gap).toBeLessThan(INTERVAL + LATENCY);
    }
  });
});
