import type { MetadataRoute } from "next";

/**
 * Web app manifest (served at /manifest.webmanifest). Next auto-injects the
 * <link rel="manifest"> because this file exists, so no metadata wiring needed.
 *
 * Icons must exist in /public — add icon-192.png and icon-512.png (a 512 doubles
 * as the maskable icon) or the install prompt won't appear.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "anime_maniacs",
    short_name: "anime_maniacs",
    description: "Track the anime you watch.",
    // Launching the installed app runs the same opening as the web sign-in
    // flow: pick a side, land on that side's newsstand. Going straight to "/"
    // skipped the picker entirely, so manga readers opened the app on the
    // anime dashboard every time.
    start_url: "/choose",
    display: "standalone",
    // Shortcut URLs must be same-origin and inside the manifest scope, so the
    // anime side's news shortcut can't point at animecorner.me the way the nav
    // now does — it opens the Community hub, which is one tap from it.
    shortcuts: [
      { name: "Community", url: "/community" },
      { name: "Manga Times", url: "/manga/news" },
      { name: "My Library", url: "/library" },
    ],
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
