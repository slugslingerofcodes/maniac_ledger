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
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Shared-element morphs (library poster → detail hero) via React's
    // <ViewTransition>. Degrades to an instant swap where unsupported.
    viewTransition: true,
  },
  images: {
    // Serve posters straight from their source CDN (MAL/AniList/Supabase)
    // instead of proxying every one through Next/Vercel Image Optimization.
    // Those CDNs already return appropriately sized, cached images, and the
    // optimizer has a monthly quota — once exhausted it 402s and EVERY poster
    // breaks site-wide. `unoptimized` emits plain <img> at the source URL, so
    // posters can't be taken down by an optimization quota.
    unoptimized: true,
    // Still declared so a future re-enable of optimization keeps working, and
    // to document that poster hosts vary (catalog contributions).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
