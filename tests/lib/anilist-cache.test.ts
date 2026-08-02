import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AniList response caching.
 *
 * The client previously had none — it leaned on `next: { revalidate }`, which
 * is inert in this app (every page reads cookies first). Against a 2.1s rate
 * budget that made every fallback render pay full price, which is what made
 * the home page crawl whenever MAL was down.
 *
 * The subtle hazard is the cache *key*: several queries in this module open
 * with byte-identical text and take the same variables (upcoming, schedule and
 * random all start `query ($page: Int, $perPage: Int) { Page(…`). A key built
 * from a prefix would silently serve one section's data to another — wrong
 * content, no error, nothing a typecheck could see.
 */

const ONE_HOUR = 3_600;

/** Two real-shaped queries that share a long prefix and identical variables. */
const UPCOMING_QUERY = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(type: ANIME, status: NOT_YET_RELEASED) { id idMal }
      }
    }`;
const SCHEDULE_QUERY = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(type: ANIME, status: RELEASING) { id idMal }
      }
    }`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  let n = 0;
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { marker: ++n } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Reach the private fetch through a caller that passes a revalidate. */
async function load() {
  const mod = await import("@/lib/anilist");
  return mod;
}

describe("AniList cache key", () => {
  it("does not share an entry between different queries with the same prefix and variables", async () => {
    const mod = await load();
    // Exercising the module's internal fetch directly, via the test-only
    // export in anilist.ts.
    const call = mod.__anilistFetchForTests as unknown as (
      q: string,
      v: Record<string, unknown>,
      o: { revalidate: number },
    ) => Promise<{ marker: number }>;

    const a = await call(UPCOMING_QUERY, { page: 1, perPage: 50 }, { revalidate: ONE_HOUR });
    const b = await call(SCHEDULE_QUERY, { page: 1, perPage: 50 }, { revalidate: ONE_HOUR });

    // Distinct queries ⇒ two upstream calls and two distinct payloads.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a.marker).not.toBe(b.marker);
  });

  it("serves a repeat of the same query from cache without touching the network", async () => {
    const mod = await load();
    // Exercising the module's internal fetch directly, via the test-only
    // export in anilist.ts.
    const call = mod.__anilistFetchForTests as unknown as (
      q: string,
      v: Record<string, unknown>,
      o: { revalidate: number },
    ) => Promise<{ marker: number }>;

    const first = await call(UPCOMING_QUERY, { page: 1 }, { revalidate: ONE_HOUR });
    const second = await call(UPCOMING_QUERY, { page: 1 }, { revalidate: ONE_HOUR });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.marker).toBe(first.marker);
  });

  it("keys on variables, so a different page is a different entry", async () => {
    const mod = await load();
    // Exercising the module's internal fetch directly, via the test-only
    // export in anilist.ts.
    const call = mod.__anilistFetchForTests as unknown as (
      q: string,
      v: Record<string, unknown>,
      o: { revalidate: number },
    ) => Promise<{ marker: number }>;

    await call(UPCOMING_QUERY, { page: 1 }, { revalidate: ONE_HOUR });
    await call(UPCOMING_QUERY, { page: 2 }, { revalidate: ONE_HOUR });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
