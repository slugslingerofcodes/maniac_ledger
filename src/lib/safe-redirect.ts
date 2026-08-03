/**
 * Same-origin redirect target validation.
 *
 * The OAuth callback used to build its redirect as `${origin}${next}` with
 * `next` straight from the query string. String concatenation is not path
 * joining, and three payloads escaped the origin outright:
 *
 * | `next=`            | resulting host                |
 * |--------------------|-------------------------------|
 * | `@evil.com`        | `evil.com`                    |
 * | `.evil.com`        | `your-app.vercel.app.evil.com` |
 * | `https://evil.com` | `your-app.vercel.apphttps`    |
 *
 * The second is the dangerous one: the hostname *begins with* the real domain,
 * which is precisely what makes a phishing link survive a glance.
 *
 * Note that `//evil.com` was already safe here — protocol-relative URLs only
 * escape when the value is used as a whole URL, not when it lands in the path
 * of an absolute one. That asymmetry is exactly why this shouldn't be
 * hand-rolled at each call site.
 */

/** Where to send a user when the requested target isn't trustworthy. */
export const DEFAULT_REDIRECT = "/choose";

/**
 * Resolve `next` to a path that is guaranteed to stay on this origin.
 *
 * Returns a path (never an absolute URL), so callers can't accidentally
 * reintroduce the bug by concatenating. Anything absolute, protocol-relative,
 * backslash-prefixed, or otherwise not a simple rooted path is rejected in
 * favour of `fallback` — an allow-list of shape, not a deny-list of payloads,
 * because deny-lists here have a long history of missing a case.
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!next) return fallback;

  // Must be a rooted path, and the character after `/` must not start an
  // authority. This rejects `//host`, `/\host`, `@host`, `.host`, `https://…`.
  if (!/^\/[^/\\]/.test(next)) return fallback;

  // Belt and braces: resolve against a throwaway origin and confirm nothing in
  // the string (encoded separators, control characters) moved it off-host.
  try {
    const probe = new URL(next, "https://redirect.invalid");
    if (probe.origin !== "https://redirect.invalid") return fallback;
    return probe.pathname + probe.search + probe.hash;
  } catch {
    return fallback;
  }
}
