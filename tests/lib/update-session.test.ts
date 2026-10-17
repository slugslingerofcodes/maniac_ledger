import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The proxy's auth gate (`updateSession`).
 *
 * It checks the session with `getClaims()` — a local JWT verification against
 * the project's JWKS — instead of `getUser()`, a round trip to Supabase Auth
 * that used to run before every single request. These pin the three things
 * that change must not cost:
 *
 *  - the gate itself: signed-out requests to gated paths still redirect, and
 *    public paths still don't;
 *  - the session refresh: cookies Supabase rewrites while reading the session
 *    must reach the browser, or every refresh silently signs the user out;
 *  - the round trip it exists to remove: a verified session must not also
 *    call `getUser()`, or the change is a no-op that only looks like a win.
 */

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options?: Record<string, unknown> }[],
  ) => void;
};

const getClaims = vi.fn();
const getUser = vi.fn();
let cookies: CookieAdapter;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: CookieAdapter }) => {
    cookies = opts.cookies;
    return { auth: { getClaims, getUser } };
  },
}));

const { updateSession } = await import("@/lib/supabase/middleware");

const req = (path: string) => new NextRequest(new URL(path, "https://app.test"));

const signedIn = () =>
  getClaims.mockResolvedValue({
    data: { claims: { sub: "user-1", role: "authenticated" } },
    error: null,
  });
const signedOut = () => getClaims.mockResolvedValue({ data: null, error: null });

beforeEach(() => {
  getClaims.mockReset();
  getUser.mockReset();
});

describe("updateSession", () => {
  it("lets a verified session through without a round trip to Supabase Auth", async () => {
    signedIn();
    const res = await updateSession(req("/library"));

    expect(res.headers.get("location")).toBeNull();
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["/library", "/login"],
    ["/anime/123", "/login"],
    ["/admin", "/admin/login"],
  ])("redirects a signed-out %s to %s", async (path, target) => {
    signedOut();
    const res = await updateSession(req(path));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(target);
  });

  it("treats a token that fails verification as signed out", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthInvalidJwtError", message: "Invalid JWT signature" },
    });
    const res = await updateSession(req("/library"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it.each(["/login", "/auth/callback", "/api/anime/search"])(
    "leaves public %s reachable without a session",
    async (path) => {
      signedOut();
      const res = await updateSession(req(path));

      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("sends cookies refreshed during the session check back to the browser", async () => {
    // A near-expiry access token: reading the session refreshes it, and the
    // client writes the new tokens through the adapter mid-check.
    getClaims.mockImplementation(async () => {
      cookies.setAll([
        { name: "sb-access-token", value: "fresh", options: { path: "/" } },
      ]);
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const res = await updateSession(req("/library"));

    expect(res.cookies.get("sb-access-token")?.value).toBe("fresh");
  });

  it("forwards the CSP request headers on the pass-through response", async () => {
    signedIn();
    const headers = new Headers({ "x-nonce": "abc123" });
    const res = await updateSession(req("/library"), headers);

    // NextResponse.next({ request: { headers } }) records overrides under
    // x-middleware-override-headers / x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe("abc123");
  });

  it("falls back to getUser() rather than 500ing when getClaims throws", async () => {
    getClaims.mockRejectedValue(new TypeError("crypto.subtle.importKey failed"));
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const res = await updateSession(req("/library"));

    expect(res.headers.get("location")).toBeNull();
    expect(getUser).toHaveBeenCalledOnce();
  });
});
