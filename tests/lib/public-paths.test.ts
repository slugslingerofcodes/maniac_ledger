import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/middleware";

/**
 * The auth gate's allowlist.
 *
 * It used to be a bare `startsWith`, so anything merely *beginning* with a
 * public path was public: `/authors`, `/logins`, or any file in public/ named
 * `auth*`. That was demonstrated live — `public/auth__probe.html` served 200
 * with no session while the same file without the prefix redirected.
 *
 * Nothing exploited it, which is precisely what makes it worth a test: the
 * failure mode is a *future* route whose name happens to start with one of
 * these shipping unauthenticated, with nothing to signal it.
 */

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/signup",
    "/reset-password",
    "/api/anime/search",
    "/admin/login",
    "/manifest.webmanifest",
    "/sw.js",
  ])("keeps %s reachable without a session", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/auth/callback", "/auth/confirm"])(
    "allows the %s callback route",
    (path) => {
      // These carry the OAuth/email codes that create the session, so they
      // must work before one exists.
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    "/authors",
    "/logins",
    "/signup-admin",
    "/reset-password-now",
    "/sw.js.map",
    "/auth-bg.webp",
    "/admin/loginbypass",
    "/api/anime/search-internal",
  ])("does not leak %s just because it shares a prefix", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it.each(["/", "/library", "/cosmos", "/admin", "/api/export", "/profile"])(
    "gates %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
