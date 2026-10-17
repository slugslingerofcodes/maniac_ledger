"use client";

import { posterUrlForWidth } from "@/lib/poster";

/**
 * The app-wide `next/image` loader (wired up as `images.loaderFile`).
 *
 * **This is not the Vercel Image Optimization API, and re-enabling that is not
 * what this change does.** A custom loader replaces the optimizer entirely:
 * Next never emits a `/_next/image?url=…` request, never proxies a byte, and
 * never touches the monthly optimization quota that once ran out and 402'd
 * every poster on the site at once. All this function does is rewrite a URL to
 * a rendition the source CDN already publishes — exactly what `poster.ts` was
 * already doing at the call site, just keyed on the width the browser asks for
 * instead of on a name the developer picked.
 *
 * What it buys: `unoptimized` emits a bare `<img src>` with no `srcSet`, so a
 * poster shipped one fixed rendition to every device and looked soft on any 2×
 * screen. With a loader, Next generates a real `srcSet` and the browser picks —
 * medium on a phone, large on a retina desktop — at no quota cost.
 *
 * Anything that isn't a recognized poster CDN (Supabase storage, catalog rows
 * contributed by users, local files under `public/`) passes through untouched,
 * so those images behave exactly as they did before. `quality` is deliberately
 * ignored: these are pre-rendered CDN files, not something we can re-encode.
 *
 * The `"use client"` directive is required — Next serializes the loader into
 * the client bundle (see the `loaderFile` docs).
 */
export default function posterImageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
}): string {
  return posterUrlForWidth(src, width) ?? src;
}
