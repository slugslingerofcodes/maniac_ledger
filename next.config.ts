import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve modern formats; the browser picks avif → webp → original.
    formats: ["image/avif", "image/webp"],
    // Posters come from MAL's CDN today, but catalog contributions may live on
    // other hosts (e.g. Supabase Storage), so allow any https image host.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
