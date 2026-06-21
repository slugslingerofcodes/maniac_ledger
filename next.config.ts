import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // MyAnimeList CDN serves the Jikan poster images used across the app.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.myanimelist.net" },
    ],
  },
};

export default nextConfig;
