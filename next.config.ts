import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
