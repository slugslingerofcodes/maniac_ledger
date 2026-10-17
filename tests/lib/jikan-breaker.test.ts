import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, searchPayload } from "../helpers/fixtures";

/**
 * The Jikan host circuit breaker.
 *
 * On a network where api.jikan.moe can't be reached at all (DNS-blocked, a
 * dead route), every call waited out the full 8s upstream timeout before its
 * fallback ran — and the per-path negative cache couldn't help a type-ahead,
 * where every prefix is a new path. Measured: ~9.5s per palette keystroke.
 *
 * What these tests pin is the breaker's *narrowness*, since that is what a
 * refactor would flatten: only failures with **no HTTP response** count.
 * Jikan fails per endpoint (`/anime?q=` can 504 for an hour while `/top/anime`
 * answers), so tripping on a 5xx would take working endpoints down with it.
 *
 * Module state (counter, cool-down, probe flag) is reset per test by
 * re-importing through `vi.resetModules()`, like the rest of jikan's caches.
 */

async function loadJikan() {
  vi.resetModules();
  return import("@/lib/jikan");
}

/** What `fetch` throws when the host can't be reached. */
const connectionFailure = () => Object.assign(new TypeError("fetch failed"), {});
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Settle a call, draining the 350ms rate-limit queue in front of it. */
async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const caught = p.catch((e: unknown) => e as Error);
  await vi.advanceTimersByTimeAsync(2_000);
  return caught;
}

/** Three distinct paths failing in a row — what trips the breaker. */
async function tripBreaker(searchAnime: (q: string) => Promise<unknown>) {
  fetchMock.mockRejectedValueOnce(connectionFailure());
  fetchMock.mockRejectedValueOnce(timeout());
  fetchMock.mockRejectedValueOnce(connectionFailure());
  for (const q of ["trip-a", "trip-b", "trip-c"]) await settle(searchAnime(q));
}

describe("tripping", () => {
  it("fails fast, without touching the network, after three unreachable calls", async () => {
    const { searchAnime, JikanUnavailableError } = await loadJikan();
    await tripBreaker(searchAnime);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // A brand-new path: no negative-cache entry could be answering this.
    const call = searchAnime("one piece").catch((e: unknown) => e);
    // Not even a queue wait — it rejects with the clock frozen.
    await vi.advanceTimersByTimeAsync(0);

    expect(await call).toBeInstanceOf(JikanUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("is a JikanError 503, so every existing fallback treats it as an outage", async () => {
    const { searchAnime, JikanError } = await loadJikan();
    await tripBreaker(searchAnime);

    const err = await settle(searchAnime("one piece"));

    expect(err).toBeInstanceOf(JikanError);
    expect((err as InstanceType<typeof JikanError>).status).toBe(503);
  });

  it("is not tripped by HTTP errors — Jikan fails per endpoint, not per host", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Gateway Timeout" }, 504));
    const { searchAnime } = await loadJikan();

    for (const q of ["a1", "a2", "a3", "a4"]) await settle(searchAnime(q));

    // All four reached the network: a 504 proves the host answers.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("counts *consecutive* failures — any response resets the count", async () => {
    const { searchAnime } = await loadJikan();
    fetchMock
      .mockRejectedValueOnce(connectionFailure())
      .mockRejectedValueOnce(connectionFailure())
      .mockResolvedValueOnce(jsonResponse(searchPayload()))
      .mockRejectedValueOnce(connectionFailure())
      .mockRejectedValueOnce(connectionFailure())
      .mockResolvedValue(jsonResponse(searchPayload()));

    for (const q of ["b1", "b2", "b3", "b4", "b5"]) await settle(searchAnime(q));
    const sixth = await settle(searchAnime("b6"));

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(sixth).not.toBeInstanceOf(Error);
  });
});

describe("while open", () => {
  it("still serves the last-good copy of a path, as in any outage", async () => {
    const { searchAnime } = await loadJikan();
    fetchMock.mockResolvedValueOnce(jsonResponse(searchPayload("Frieren")));
    await settle(searchAnime("frieren"));
    // Expire the 1h response cache so the next call has to go live.
    await vi.advanceTimersByTimeAsync(3_600_000 + 1);
    await tripBreaker(searchAnime);

    const res = await settle(searchAnime("frieren"));

    expect(res).toMatchObject({ data: [{ title: "Frieren" }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not negative-cache its rejections, so recovery shows at once", async () => {
    const { searchAnime } = await loadJikan();
    await tripBreaker(searchAnime);
    await settle(searchAnime("naruto")); // rejected fast while open

    // Cool-down lapses; the next call kicks off a probe, which succeeds.
    await vi.advanceTimersByTimeAsync(30_000);
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Naruto")));
    await settle(searchAnime("probe-trigger"));

    // Closed again — and "naruto" was not cached as a failure for 60s.
    const res = await settle(searchAnime("naruto"));
    expect(res).toMatchObject({ data: [{ title: "Naruto" }] });
  });
});

describe("recovery", () => {
  it("probes in the background after the cool-down; the caller still fails fast", async () => {
    const { searchAnime, JikanUnavailableError } = await loadJikan();
    await tripBreaker(searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    // The probe hangs, like the outage it is testing for.
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));

    const call = searchAnime("after-cooldown").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    // The caller didn't become the probe: it was answered immediately...
    expect(await call).toBeInstanceOf(JikanUnavailableError);
    // ...while exactly one probe went out on its behalf.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // And a second caller during the probe doesn't start another.
    await settle(searchAnime("during-probe"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("closes on the probe's first response", async () => {
    const { searchAnime } = await loadJikan();
    await tripBreaker(searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    fetchMock.mockResolvedValue(jsonResponse(searchPayload("Back")));

    await settle(searchAnime("trigger")); // fails fast, probe succeeds
    const res = await settle(searchAnime("next"));

    expect(res).toMatchObject({ data: [{ title: "Back" }] });
  });

  it("stays open after a failed probe, backing off before the next", async () => {
    const { searchAnime } = await loadJikan();
    await tripBreaker(searchAnime);
    await vi.advanceTimersByTimeAsync(30_000);
    fetchMock.mockRejectedValue(connectionFailure());

    await settle(searchAnime("trigger")); // probe #1 fails → 60s cool-down
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // 30s later the old cool-down would have lapsed; the doubled one hasn't.
    await vi.advanceTimersByTimeAsync(30_000);
    await settle(searchAnime("too-soon"));
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(30_000);
    await settle(searchAnime("in-time"));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
