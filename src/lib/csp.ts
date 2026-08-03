/**
 * Content-Security-Policy for every HTML response.
 *
 * The app previously shipped `frame-ancestors 'none'` and nothing else, which
 * is clickjacking protection with **no XSS mitigation at all**. There is no
 * known injection sink today (no `dangerouslySetInnerHTML` anywhere, and React
 * escapes the chat body), but CSP is the layer that matters on the day a
 * dependency introduces one — which is exactly when you can't add it in a hurry.
 *
 * ## Where this policy is strict, and where it isn't
 *
 * **`script-src` is strict**: a per-request nonce plus `strict-dynamic`, so an
 * injected `<script>` cannot run without guessing the nonce. That is where
 * essentially all of the value is.
 *
 * **`style-src` keeps `'unsafe-inline'`**, deliberately. Framer Motion and GSAP
 * both write inline `style` attributes on every animation frame — that is their
 * entire mechanism — and CSP governs style attributes under the same directive.
 * Locking it would break every animation in the app to defend against a vector
 * (CSS injection) that is far weaker than script injection and only reachable
 * through a sink that doesn't exist here. Strict scripts with pragmatic styles
 * is the usual production trade; pretending otherwise would mean shipping a
 * policy someone has to disable at the first bug report.
 *
 * The host allowances are all load-bearing — see the comments inline. Each one
 * was chosen from what the app actually loads, not copied from a template.
 */

export type CspResult = { nonce: string; policy: string };

/**
 * Build a policy and the nonce it embeds. A fresh nonce per request is the
 * whole point: a predictable one is no protection.
 */
export function buildCsp(isDev: boolean): CspResult {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const directives = [
    `default-src 'self'`,

    // `strict-dynamic` lets a nonce'd script load further scripts (which is how
    // Next boots its chunks and how Vercel Analytics injects itself) while
    // ignoring host allow-lists — the modern, harder-to-bypass shape.
    // `unsafe-eval` is dev-only: React uses eval there to rebuild server error
    // stacks in the browser. Neither React nor Next needs it in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // See the note above — animation libraries mutate style attributes.
    `style-src 'self' 'unsafe-inline'`,

    // Posters come from any https host: `next.config.ts` sets
    // `remotePatterns: [{ hostname: "**" }]` because catalog contributions can
    // reference arbitrary CDNs. Narrowing this would break user-added art.
    `img-src 'self' data: blob: https:`,

    `font-src 'self' data:`,

    // Supabase REST + Realtime (wss), the app's own API routes, and Vercel
    // analytics beacons.
    `connect-src 'self' https: wss:`,

    // Video backdrops from public/, plus AnimeThemes audio/video streams.
    `media-src 'self' https: blob:`,

    // YouTube trailers are embedded on anime detail pages.
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com`,

    // Nothing legitimately embeds this app, and nothing here uses plugins.
    `frame-ancestors 'none'`,
    `object-src 'none'`,

    // Blocks a `<base>` tag injection from re-pointing every relative URL, and
    // stops an injected form from posting credentials off-origin. Both are
    // cheap and close real attack classes.
    `base-uri 'self'`,
    `form-action 'self'`,
  ];

  // Only meaningful over TLS, and in dev it would rewrite localhost requests.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return { nonce, policy: directives.join("; ") };
}
