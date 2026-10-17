import { describe, expect, it } from "vitest";

import { posterUrl, posterUrlForWidth } from "@/lib/poster";

/**
 * Poster rendition rewriting.
 *
 * This runs on every image the app draws, so its failure mode is not "a page is
 * slow" but "every poster on the site is a broken-image icon" — the same
 * outcome as the image-optimizer quota incident this was written to avoid. The
 * two properties worth guarding are therefore both about *not* breaking things:
 * unknown hosts must pass through untouched, and a rewrite must never ask a CDN
 * for a rendition larger than the one it was handed.
 */

const MAL_LARGE = "https://cdn.myanimelist.net/images/anime/1540/155824l.jpg";
const MAL_MEDIUM = "https://cdn.myanimelist.net/images/anime/1540/155824.jpg";
const MAL_THUMB = "https://cdn.myanimelist.net/images/anime/1540/155824t.jpg";

const AL = (size: string) =>
  `https://s4.anilist.co/file/anilistcdn/media/anime/cover/${size}/bx163270-wboZJp0ybwVK.jpg`;

describe("posterUrl — MyAnimeList", () => {
  it("drops a large poster to the medium rendition for grid cells", () => {
    // 424×600 / 116 KB → 225×318 / 41 KB, still sharp at 2x in a ~120px cell.
    expect(posterUrl(MAL_LARGE, "card")).toBe(MAL_MEDIUM);
  });

  it("drops to the thumbnail only where the image is blurred anyway", () => {
    expect(posterUrl(MAL_LARGE, "blur")).toBe(MAL_THUMB);
  });

  it("leaves the hero at the large rendition", () => {
    expect(posterUrl(MAL_LARGE, "full")).toBe(MAL_LARGE);
  });

  it("recognises a medium URL and doesn't re-suffix it", () => {
    expect(posterUrl(MAL_MEDIUM, "card")).toBe(MAL_MEDIUM);
  });

  it("handles manga paths, which share the scheme", () => {
    const manga = "https://cdn.myanimelist.net/images/manga/3/258224l.jpg";
    expect(posterUrl(manga, "card")).toBe(
      "https://cdn.myanimelist.net/images/manga/3/258224.jpg",
    );
  });
});

describe("posterUrl — AniList", () => {
  it("swaps the size path segment for grid cells", () => {
    expect(posterUrl(AL("large"), "card")).toBe(AL("medium"));
  });

  it("uses small for blurred backdrops", () => {
    // AniList's "small" is 100×142 — genuinely usable, unlike MAL's 42px thumb.
    expect(posterUrl(AL("large"), "blur")).toBe(AL("small"));
  });

  it("treats extraLarge as top of the ladder and shrinks from it", () => {
    expect(posterUrl(AL("extraLarge"), "card")).toBe(AL("medium"));
  });
});

describe("posterUrl — safety", () => {
  it("never upgrades, because the bigger rendition may not exist", () => {
    // AniList 404s extraLarge for .jpg covers; MAL 404s the `v` suffix. Asking
    // for more than we were given turns a working poster into a broken one.
    expect(posterUrl(MAL_THUMB, "full")).toBe(MAL_THUMB);
    expect(posterUrl(MAL_THUMB, "card")).toBe(MAL_THUMB);
    expect(posterUrl(AL("small"), "full")).toBe(AL("small"));
  });

  it("passes unknown hosts through untouched", () => {
    // Posters also come from Supabase storage and from user-contributed catalog
    // rows on arbitrary https hosts (remotePatterns allows any).
    const others = [
      "https://pmxozhuvqfufhlgwjpem.supabase.co/storage/v1/object/public/avatars/x.png",
      "https://example.com/images/anime/1540/155824l.jpg",
      "https://uploads.mangadex.org/covers/abc/def.jpg.512.jpg",
      "/local-poster.png",
    ];
    for (const u of others) {
      expect(posterUrl(u, "card")).toBe(u);
      expect(posterUrl(u, "blur")).toBe(u);
    }
  });

  it("returns null for absent posters rather than a broken string", () => {
    expect(posterUrl(null, "card")).toBeNull();
    expect(posterUrl(undefined, "card")).toBeNull();
    expect(posterUrl("", "card")).toBeNull();
  });

  it("does not mistake a non-numeric filename for a MAL rendition", () => {
    // The pattern requires digits before the size letter; without that, a file
    // like `cool.jpg` would have its final letter eaten.
    const odd = "https://cdn.myanimelist.net/images/anime/1540/cool.jpg";
    expect(posterUrl(odd, "card")).toBe(odd);
  });
});

/**
 * The width-keyed ladder behind the `next/image` loader.
 *
 * This is the whole reason a poster can be crisp on a retina screen: the loader
 * is called once per srcSet candidate, so the mapping from a requested width to
 * a rendition *is* the srcSet. Worth guarding directly, because the rendered
 * srcSet can't be asserted in the component tests — vitest doesn't read
 * `next.config.ts`, so `next/image` falls back to the default loader there and
 * emits `/_next/image` URLs that never occur in a real build.
 */
describe("posterUrlForWidth", () => {
  it("climbs the ladder as the requested width grows", () => {
    // A single <Image> asks for several widths; small cells get the thumbnail,
    // and a 2x grid cell (~640) must reach the large rendition or the whole
    // exercise buys nothing.
    expect(posterUrlForWidth(MAL_LARGE, 96)).toBe(MAL_THUMB);
    expect(posterUrlForWidth(MAL_LARGE, 256)).toBe(MAL_MEDIUM);
    expect(posterUrlForWidth(MAL_LARGE, 640)).toBe(MAL_LARGE);
    expect(posterUrlForWidth(MAL_LARGE, 3840)).toBe(MAL_LARGE);
  });

  it("still never rewrites upwards", () => {
    // The larger rendition may simply not exist, so a wide request against a
    // thumbnail must stay a thumbnail rather than invent a 404.
    expect(posterUrlForWidth(MAL_THUMB, 3840)).toBe(MAL_THUMB);
    expect(posterUrlForWidth(MAL_MEDIUM, 1920)).toBe(MAL_MEDIUM);
  });

  it("passes unknown hosts and absent posters through", () => {
    const supabase =
      "https://pmxozhuvqfufhlgwjpem.supabase.co/storage/v1/object/public/avatars/x.png";
    expect(posterUrlForWidth(supabase, 640)).toBe(supabase);
    expect(posterUrlForWidth("/am-monogram.webp", 96)).toBe("/am-monogram.webp");
    expect(posterUrlForWidth(null, 640)).toBeNull();
  });
});
