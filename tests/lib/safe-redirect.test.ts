import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Open-redirect guard for the auth callback and the email-confirmation route.
 *
 * Both take `next` from a URL the user clicked — an OAuth redirect or a link in
 * an email — so it is attacker-controlled by definition. The original code
 * concatenated it onto the origin, and the payloads below were verified against
 * the live deployment before the fix: `@evil.com` resolved to host `evil.com`,
 * and `.evil.com` to `your-app.vercel.app.evil.com`, a hostname that *starts
 * with* the real domain.
 *
 * Every case here is a payload, so this file's job is to stay paranoid: new
 * bypasses get appended, never traded away for a tidier assertion.
 */

const ORIGIN_ESCAPES = [
  "@evil.com",
  ".evil.com",
  "https://evil.com",
  "http://evil.com",
  "//evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "\\/evil.com",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "//user:pass@evil.com/path",
  "/%2F%2Fevil.com",
  "///evil.com",
  "http:/\\evil.com",
];

describe("safeRedirectPath — rejects anything that leaves the origin", () => {
  it.each(ORIGIN_ESCAPES)("neutralises %s", (payload) => {
    const out = safeRedirectPath(payload);
    // Rooted, single-slash, no scheme. Deliberately *not* asserting the string
    // lacks "evil.com": `/%2F%2Fevil.com` keeps those characters and is
    // perfectly safe (encoded slashes are not path separators for host
    // resolution), and a real path like `/search?q=evil.com` would fail such a
    // check. The property that matters is the host, tested below.
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(out).not.toMatch(/^[a-z]+:/i);
  });

  it("never returns an absolute URL, whatever it is given", () => {
    for (const payload of ORIGIN_ESCAPES) {
      const out = safeRedirectPath(payload);
      // If a caller concatenates this onto an origin (which is exactly what
      // the callback does), the result must stay on that origin.
      expect(new URL("https://app.test" + out).host).toBe("app.test");
    }
  });
});

describe("safeRedirectPath — allows legitimate in-app destinations", () => {
  it.each([
    "/choose",
    "/library",
    "/anime/mal/52991",
    "/account/update-password",
    "/search?q=frieren&page=2",
    "/lists/abc#top",
  ])("passes %s through", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it("falls back for empty or missing values", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirectPath("@evil.com", "/login")).toBe("/login");
  });
});
