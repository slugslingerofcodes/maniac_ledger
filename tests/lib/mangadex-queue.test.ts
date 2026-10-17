import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MangaDex's rate-limit queue: a deadline per request, and a caller can leave.
 *
 * MangaDex backs MAL up in the ⌘K palette's manga search, so it is hit on
 * every debounced keystroke whenever MAL is slow. The queue used to chain each
 * request on the previous one's *completion* with no timeout, so a superseded
 * prefix still ran (~1s each) ahead of the query someone was waiting for, and
 * one hung call held every call behind it indefinitely. These tests pin the
 * replacement: starts spaced 300ms apart regardless of completions, an 8s
 * deadline, and an abort before a request's slot gives the slot away.
 */

async function loadMangaDex() {
  vi.resetModules();
  return import("@/lib/mangadex");
}

let fetchMock: ReturnType<typeof vi.fn>;
/** The `title` param of each request actually sent, with its start time. */
let sent: { title: string; at: number }[];

function ok() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({ data: [], total: 0 }),
  };
}

/** A fetch that never answers on its own — only its abort signal ends it. */
function hang(_url: string, init: RequestInit) {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
      once: true,
    });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // Node's AbortSignal.timeout runs on its own timer, which fake timers can't
  // drive — a "hung" request would quietly time out in real time mid-test and
  // let a broken queue pass. Stand in a signal that rides the faked setTimeout.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(
      () => c.abort(new DOMException("The operation timed out.", "TimeoutError")),
      ms,
    );
    return c.signal;
  });
  sent = [];
  fetchMock = vi.fn((url: string) => {
    sent.push({ title: new URL(url).searchParams.get("title") ?? "", at: Date.now() });
    return Promise.resolve(ok());
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MangaDex queue", () => {
  it("gives an abandoned caller's slot to the next in line", async () => {
    const { searchMangaDexManga } = await loadMangaDex();
    const t0 = Date.now();
    const typedPast = new AbortController();

    const first = searchMangaDexManga("ber");
    const stale = searchMangaDexManga("bers", 1, undefined, {
      signal: typedPast.signal,
    }).catch((e: unknown) => e);
    const wanted = searchMangaDexManga("berserk");
    await vi.advanceTimersByTimeAsync(0);
    // The palette moved on before "bers" got its slot.
    typedPast.abort();
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([first, wanted]);

    expect(sent.map((s) => s.title)).toEqual(["ber", "berserk"]);
    // One slot after the first request — not two.
    expect(sent[1].at - t0).toBe(300);
    expect(await stale).toBeInstanceOf(DOMException);
  });

  it("never sends a request whose caller had already gone", async () => {
    const { searchMangaDexManga } = await loadMangaDex();
    const gone = new AbortController();
    gone.abort();

    const call = searchMangaDexManga("berserk", 1, undefined, {
      signal: gone.signal,
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await call).toBeInstanceOf(DOMException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a request run on once its slot came up, even if its caller leaves", async () => {
    // The slot is spent either way, and the answer still warms the Data Cache.
    let inFlight: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      sent.push({ title: new URL(url).searchParams.get("title") ?? "", at: Date.now() });
      inFlight = init.signal ?? undefined;
      return new Promise((resolve) => setTimeout(() => resolve(ok()), 1_000));
    });
    const { searchMangaDexManga } = await loadMangaDex();
    const late = new AbortController();

    const call = searchMangaDexManga("berserk", 1, undefined, {
      signal: late.signal,
    }).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    late.abort();
    await vi.advanceTimersByTimeAsync(5_000);
    await call;

    expect(sent.map((s) => s.title)).toEqual(["berserk"]);
    expect(inFlight?.aborted).toBe(false);
  });

  it("doesn't hold the next request behind a hung one", async () => {
    // Completion-chaining meant the second search waited on the first forever.
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      sent.push({ title: new URL(url).searchParams.get("title") ?? "", at: Date.now() });
      return hang(url, init);
    });
    const { searchMangaDexManga } = await loadMangaDex();
    const t0 = Date.now();

    void searchMangaDexManga("hung").catch(() => {});
    const next = searchMangaDexManga("berserk");
    await vi.advanceTimersByTimeAsync(300);

    expect(sent.map((s) => s.title)).toEqual(["hung", "berserk"]);
    expect(sent[1].at - t0).toBe(300);
    await expect(next).resolves.toMatchObject({ results: [] });
  });

  it("gives up on a request that outlives its 8s deadline", async () => {
    fetchMock.mockImplementation(hang);
    const { searchMangaDexManga } = await loadMangaDex();

    let settled = false;
    const call = searchMangaDexManga("hung")
      .catch((e: unknown) => e)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    const err = await call;

    expect(AbortSignal.timeout).toHaveBeenCalledWith(8_000);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("TimeoutError");
  });
});
