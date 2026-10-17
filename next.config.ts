import type { NextConfig } from "next";

/**
 * Baseline hardening for every response. Deliberately conservative: only
 * directives that cannot break existing behavior. A full script/style CSP
 * needs nonce plumbing through Next's inline hydration scripts — do that as
 * its own change, not as a rider here. (frame-ancestors governs who may embed
 * THIS app; the YouTube trailers we embed are unaffected.)
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // The real Content-Security-Policy is set per-request in `src/proxy.ts`,
  // because it carries a fresh nonce each time and a static header cannot.
  // Deliberately not duplicated here: two CSP headers are intersected by the
  // browser, so the weaker static one would silently override nothing while
  // making the effective policy impossible to reason about.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * Static art in `public/` ships with Vercel's default
 * `Cache-Control: max-age=0, must-revalidate`, because those files aren't
 * content-hashed the way `/_next/static` assets are. That costs a revalidation
 * round trip per asset per navigation — measured on the deployed site.
 *
 * A week of `max-age` with a month of `stale-while-revalidate` is the trade:
 * repeat visits use the cached copy with no request at all, and a replaced file
 * still reaches everyone within a week (immediately for anyone past the
 * `stale-while-revalidate` window, who gets the cached copy *and* a background
 * refresh). Deliberately not `immutable` — these filenames are stable, so an
 * edited asset under `immutable` could be pinned in caches for a year.
 */
const STATIC_ASSET_CACHE = [
  {
    key: "Cache-Control",
    value: "public, max-age=604800, stale-while-revalidate=2592000",
  },
];

/*
 * Function region: pinned to `icn1` (Seoul) in vercel.json, which can't carry
 * this comment. The Supabase project is in ap-northeast-2 (Seoul), and a page
 * here makes several *sequential* Supabase round trips (session, row,
 * progress…). From Vercel's default `iad1` each one crosses the Pacific
 * (~150–200 ms); from `icn1` it stays in-region (single-digit ms). The cost:
 * uncached Jikan/AniList fetches start farther from those US/EU hosts — but
 * those are cached (process + the Supabase-backed `http_cache`, now
 * in-region too) and streamed behind Suspense, so they no longer gate a page.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      {
        source: "/:file(.+\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|woff2|mp4|webm))",
        headers: STATIC_ASSET_CACHE,
      },
    ];
  },
  experimental: {
    // Shared-element morphs (library poster → detail hero) via React's
    // <ViewTransition>. Degrades to an instant swap where unsupported.
    viewTransition: true,
    // Client router cache. Every page here reads `cookies()` (auth), so every
    // route is "dynamic" — and since Next 15 the dynamic TTL defaults to 0,
    // meaning navigating back to a page you just left refetched it from the
    // server and re-ran the whole Jikan/Supabase chain. These TTLs let an
    // already-rendered segment be reused, so back/forward and tab-hopping
    // repaint from memory instead of showing the skeleton again.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
  images: {
    // Posters are served straight from their source CDN (MAL/AniList/Supabase),
    // never through Next/Vercel Image Optimization: that optimizer has a monthly
    // quota, and once it ran out it 402'd and EVERY poster on the site broke at
    // once. A *custom loader* keeps that door shut — Next emits no
    // `/_next/image` request and proxies no bytes, so there is no quota to
    // exhaust — while restoring the one thing `unoptimized: true` gave up:
    // a real `srcSet`.
    //
    // `unoptimized` emitted a bare <img src> with a single fixed rendition, so
    // every poster looked soft on a 2× screen. The loader picks the CDN's own
    // rendition for whatever width the browser asks for, so one <Image> now
    // advertises medium at 1× and large at 2×. See `src/lib/image-loader.ts`.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Ignored while a custom loader is configured (remote hosts are fetched by
    // the browser, not by us), but kept to document that poster hosts vary —
    // catalog rows are contributed by users — and so removing the loader
    // doesn't silently break every remote image.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
