import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared cache tier (`http_cache`, migration 0026).
 *
 * Two properties matter and neither is visible to a typecheck. First, it must
 * fail soft in every direction: a missing key, an unapplied migration, or a
 * dead Postgres has to read as a cache miss, because the caller's fallback is
 * simply "go to the network". Second, it must never serve an expired row —
 * that's the difference between a cache and a stale-data bug.
 */

// Mocked at the module boundary: `createAdminClient` is the one place that
// builds a service-role client, and it throws when the key is unset.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { createAdminClient } = await import("@/lib/supabase/admin");
const createClientMock = vi.mocked(createAdminClient);

/** Build a thenable PostgREST stub whose `maybeSingle`/`upsert` we can inspect. */
function supabaseStub(result: { data?: unknown; error?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: null, error: null, ...result }),
    ),
  };
  for (const m of ["select", "eq", "gt", "upsert"]) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  // `upsert` is awaited directly (no .maybeSingle()).
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null, ...result }).then(resolve);

  const from = vi.fn(() => builder);
  createClientMock.mockReturnValue({ from } as never);
  return { from, builder: builder as Record<string, ReturnType<typeof vi.fn>>, calls };
}

/**
 * Fresh module: the client is memoized at module scope.
 * `withKey: false` models a deploy where the service key was never set —
 * `createAdminClient` throws in exactly that case.
 */
async function loadCache({ withKey = true }: { withKey?: boolean } = {}) {
  vi.resetModules();
  if (!withKey) {
    createClientMock.mockImplementation(() => {
      throw new Error(
        "Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    });
  }
  return import("@/lib/http-cache");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("when the service key is absent", () => {
  it("reads as a miss rather than throwing", async () => {
    const { from } = supabaseStub({
      data: { value: { a: 1 }, expires_at: "2099-01-01T00:00:00Z" },
    });
    const { sharedCacheGet } = await loadCache({ withKey: false });

    // The app must run exactly as before, on the in-process cache alone —
    // and must not query a table it has no credentials for.
    expect(await sharedCacheGet("jikan:/anime")).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("makes a write a silent no-op", async () => {
    const { from } = supabaseStub();
    const { sharedCacheSet } = await loadCache({ withKey: false });

    await expect(sharedCacheSet("k", { a: 1 }, 60)).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("says so once, not on every request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    supabaseStub();
    const { sharedCacheGet } = await loadCache({ withKey: false });

    await sharedCacheGet("a");
    await sharedCacheGet("b");
    await sharedCacheGet("c");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("sharedCacheGet", () => {
  it("returns the stored value and its expiry", async () => {
    supabaseStub({
      data: { value: { title: "Frieren" }, expires_at: "2099-01-01T00:00:00Z" },
    });
    const { sharedCacheGet } = await loadCache();

    const hit = await sharedCacheGet<{ title: string }>("jikan:/anime/1");

    expect(hit).toEqual({
      value: { title: "Frieren" },
      expiresAt: Date.parse("2099-01-01T00:00:00Z"),
    });
  });

  it("filters expiry in SQL, so a stalled purge can't serve stale rows", async () => {
    // Trusting expires_at from the row would make a clock skew a correctness
    // bug; let Postgres decide what's live.
    const { calls } = supabaseStub({ data: null });
    const { sharedCacheGet } = await loadCache();

    await sharedCacheGet("jikan:/anime/1");

    const gt = calls.find((c) => c.method === "gt");
    expect(gt?.args[0]).toBe("expires_at");
    expect(Date.parse(String(gt?.args[1]))).toBeCloseTo(Date.now(), -3);
  });

  it("looks the row up by key", async () => {
    const { calls, from } = supabaseStub({ data: null });
    const { sharedCacheGet } = await loadCache();

    await sharedCacheGet("jikan:/anime/1");

    expect(from).toHaveBeenCalledWith("http_cache");
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["key", "jikan:/anime/1"]);
  });

  it("misses when no row matches", async () => {
    supabaseStub({ data: null });
    const { sharedCacheGet } = await loadCache();

    expect(await sharedCacheGet("nope")).toBeUndefined();
  });

  it("misses when the table does not exist yet", async () => {
    // Migration 0026 unapplied — the deploy must not break.
    supabaseStub({ error: { message: 'relation "http_cache" does not exist' } });
    const { sharedCacheGet } = await loadCache();

    expect(await sharedCacheGet("k")).toBeUndefined();
  });

  it("misses when the query throws outright", async () => {
    createClientMock.mockReturnValue({
      from: vi.fn(() => {
        throw new Error("connection refused");
      }),
    } as never);
    const { sharedCacheGet } = await loadCache();

    expect(await sharedCacheGet("k")).toBeUndefined();
  });

  it("misses when the query rejects", async () => {
    const builder: Record<string, unknown> = {
      maybeSingle: vi.fn(() => Promise.reject(new Error("timeout"))),
    };
    for (const m of ["select", "eq", "gt"]) builder[m] = vi.fn(() => builder);
    createClientMock.mockReturnValue({ from: vi.fn(() => builder) } as never);
    const { sharedCacheGet } = await loadCache();

    expect(await sharedCacheGet("k")).toBeUndefined();
  });
});

describe("sharedCacheSet", () => {
  it("upserts the value with an absolute expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T12:00:00Z"));
    const { builder } = supabaseStub();
    const { sharedCacheSet } = await loadCache();

    await sharedCacheSet("jikan:/anime/1", { title: "Frieren" }, 3_600);

    expect(builder.upsert.mock.calls[0][0]).toEqual({
      key: "jikan:/anime/1",
      value: { title: "Frieren" },
      expires_at: "2024-03-15T13:00:00.000Z",
    });
    vi.useRealTimers();
  });

  it("replaces an existing entry for the key", async () => {
    const { builder } = supabaseStub();
    const { sharedCacheSet } = await loadCache();

    await sharedCacheSet("k", { a: 1 }, 60);

    expect(builder.upsert.mock.calls[0][1]).toEqual({ onConflict: "key" });
  });

  it("swallows a write failure, because a failed cache write is not a failed request", async () => {
    supabaseStub({ error: { message: "permission denied" } });
    const { sharedCacheSet } = await loadCache();

    await expect(sharedCacheSet("k", { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it("swallows a rejected write", async () => {
    const builder: Record<string, unknown> = {
      upsert: vi.fn(() => Promise.reject(new Error("timeout"))),
    };
    createClientMock.mockReturnValue({ from: vi.fn(() => builder) } as never);
    const { sharedCacheSet } = await loadCache();

    await expect(sharedCacheSet("k", { a: 1 }, 60)).resolves.toBeUndefined();
  });
});

describe("client construction", () => {
  it("goes through the service-role client, the only one that can reach the table", async () => {
    // http_cache has RLS on with no policies or grants, so the anon key —
    // and therefore the normal server client — cannot read or write it.
    supabaseStub({ data: null });
    const { sharedCacheGet } = await loadCache();

    await sharedCacheGet("k");

    expect(createClientMock).toHaveBeenCalled();
  });

  it("builds the client once and reuses it", async () => {
    supabaseStub({ data: null });
    const { sharedCacheGet, sharedCacheSet } = await loadCache();

    await sharedCacheGet("a");
    await sharedCacheGet("b");
    await sharedCacheSet("c", {}, 60);

    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
