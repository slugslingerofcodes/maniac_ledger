import { beforeEach, describe, expect, it, vi } from "vitest";

import { clientReturning, queryBuilder } from "../helpers/supabase";

/**
 * `user_progress` is no longer owner-scoped by RLS alone: migration 0015 added
 * an additive "public profiles progress readable" SELECT policy, and Postgres
 * ORs permissive policies together. Any "my rows" query that forgets
 * `eq("user_id", …)` therefore returns strangers' rows too — which is exactly
 * how the same anime rendered twice in the library grid (duplicate React keys)
 * carrying someone else's watch status.
 *
 * Nothing about that failure is visible to a typecheck, and it only reproduces
 * once a second user makes their profile public — so it is pinned here.
 */

const USER = { id: "user-1" };

vi.mock("@/lib/supabase/auth", () => ({
  getUser: vi.fn(async () => USER),
}));

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

// Pulled in by the module under test but irrelevant here.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { getUserLibrary } = await import("@/app/actions/library");

let builder: ReturnType<typeof queryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  builder = queryBuilder({ data: [], error: null });
  createClientMock.mockResolvedValue(clientReturning(builder));
});

describe("getUserLibrary", () => {
  it("scopes the query to the signed-in user", async () => {
    await getUserLibrary();

    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
  });

  it("returns nothing when signed out instead of querying at all", async () => {
    const { getUser } = await import("@/lib/supabase/auth");
    vi.mocked(getUser).mockResolvedValueOnce(null as never);

    const result = await getUserLibrary();

    expect(result).toEqual([]);
    expect(builder.called("select")).toBe(false);
  });
});
