import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AniList's rate-limit queue lets a caller *leave*.
 *
 * AniList allows 30 requests a minute, so the client spaces starts 2.1s apart.
 * When Jikan is unreachable the ⌘K palette lands here on every debounced
 * keystroke, and with a queue that couldn't shed abandoned work, the query
 * someone was actually waiting for ran behind every prefix they had already
 * typed past — several 2.1s slots late. The palette aborts superseded fetches;
 * these tests pin that an abort before a request's slot gives the slot to the
 * next caller, and that a request shared by several callers is only abandoned
 * once all of them have gone.
 */

async function loadAnilist() {
  vi.resetModules();
  return import("@/lib/anilist");
}

let fetchMock: ReturnType<typeof vi.fn>;
/** `variables.search` of each request actually sent, with its start time. */
let sent: { search: string; at: number }[];

function page(title: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () =>
      Promise.resolve({
        data: {
          Page: {
            pageInfo: { total: 1, currentPage: 1, lastPage: 1, hasNextPage: false, perPage: 50 },
            media: [
              {
                id: 1,
                idMal: 1,
                title: { romaji: title, english: null },
                description: null,
                format: "TV",
                status: "FINISHED",
                episodes: 12,
                duration: 24,
                averageScore: 80,
                popularity: 10,
                season: null,
                seasonYear: 2020,
                startDate: { year: 2020 },
                coverImage: null,
                genres: [],
                studios: { nodes: [] },
              },
            ],
          },
        },
      }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  fetchMock = vi.fn((_url: string, init: RequestInit) => {
    const { variables } = JSON.parse(String(init.body)) as {
      variables: { search?: string };
    };
    sent.push({ search: variables.search ?? "", at: Date.now() });
    return Promise.resolve(page(variables.search ?? ""));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AniList queue", () => {
  it("gives an abandoned caller's slot to the next in line", async () => {
    const { searchAnilist } = await loadAnilist();
    const t0 = Date.now();
    const typedPast = new AbortController();

    const first = searchAnilist({ query: "on" });
    const stale = searchAnilist({ query: "one" }, 1, { signal: typedPast.signal }).catch(
      (e: unknown) => e,
    );
    const wanted = searchAnilist({ query: "one piece" });
    await vi.advanceTimersByTimeAsync(0);
    // The palette moved on before "one" got its slot.
    typedPast.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, wanted]);

    expect(sent.map((s) => s.search)).toEqual(["on", "one piece"]);
    // One slot after the first request — not two.
    expect(sent[1].at - t0).toBe(2_100);
    expect(await stale).toBeInstanceOf(DOMException);
  });

  it("keeps spacing starts 2.1s apart for callers that stay", async () => {
    const { searchAnilist } = await loadAnilist();

    const work = Promise.all([
      searchAnilist({ query: "a" }),
      searchAnilist({ query: "b" }),
      searchAnilist({ query: "c" }),
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    await work;

    expect(sent[1].at - sent[0].at).toBeGreaterThanOrEqual(2_100);
    expect(sent[2].at - sent[1].at).toBeGreaterThanOrEqual(2_100);
  });

  it("doesn't cancel a shared request while another caller still wants it", async () => {
    const { searchAnilist } = await loadAnilist();
    const leaving = new AbortController();

    // Occupy the slot so both callers below queue for the same request.
    void searchAnilist({ query: "blocker" });
    const quitter = searchAnilist({ query: "frieren" }, 1, { signal: leaving.signal }).catch(
      (e: unknown) => e,
    );
    const stayer = searchAnilist({ query: "frieren" });
    leaving.abort();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await quitter).toBeInstanceOf(DOMException);
    await expect(stayer).resolves.toMatchObject({ data: [{ title: "frieren" }] });
    expect(sent.map((s) => s.search)).toEqual(["blocker", "frieren"]);
  });

  it("abandons a shared request once every caller has gone", async () => {
    const { searchAnilist } = await loadAnilist();
    const a = new AbortController();
    const b = new AbortController();

    void searchAnilist({ query: "blocker" });
    const first = searchAnilist({ query: "frieren" }, 1, { signal: a.signal }).catch(() => {});
    const second = searchAnilist({ query: "frieren" }, 1, { signal: b.signal }).catch(() => {});
    a.abort();
    b.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);

    expect(sent.map((s) => s.search)).toEqual(["blocker"]);
  });

  it("still sends a request whose caller leaves after its slot came up", async () => {
    // The slot is spent either way, and the answer fills the cache.
    const { searchAnilist } = await loadAnilist();
    const late = new AbortController();

    const call = searchAnilist({ query: "frieren" }, 1, { signal: late.signal }).catch(
      () => {},
    );
    await vi.advanceTimersByTimeAsync(0);
    late.abort();
    await call;

    expect(sent.map((s) => s.search)).toEqual(["frieren"]);
    await expect(searchAnilist({ query: "frieren" })).resolves.toMatchObject({
      data: [{ title: "frieren" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports readiness from the real queue wait, for the search hedge", async () => {
    const { searchAnilist, anilistReadyWithin } = await loadAnilist();
    expect(anilistReadyWithin(0)).toBe(true);

    void searchAnilist({ query: "a" });
    await vi.advanceTimersByTimeAsync(0);
    expect(anilistReadyWithin(300)).toBe(false);

    await vi.advanceTimersByTimeAsync(1_850);
    expect(anilistReadyWithin(300)).toBe(true);
  });
});
