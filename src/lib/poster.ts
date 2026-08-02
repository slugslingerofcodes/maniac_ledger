/**
 * Right-sized poster URLs.
 *
 * The app asked both catalog CDNs for their largest poster everywhere — in
 * 40px chart rows, in ~120px grid cells, and behind a `blur-md` backdrop where
 * resolution is meaningless. A Lighthouse run on the deployed home page put
 * 2,926 KB of the 2,949 KB payload in images, with individual posters at 482,
 * 450 and 369 KB.
 *
 * Both CDNs already publish smaller renditions, so this is a URL rewrite rather
 * than an image pipeline — which matters, because Next/Vercel image
 * optimization is deliberately off (`images.unoptimized`): its monthly quota
 * once ran out and 402'd every poster on the site at once. Nothing here goes
 * near that.
 *
 * Measured, same poster, both CDNs:
 *
 * | rendition        | dimensions | bytes  |
 * |------------------|------------|--------|
 * | MAL `<id>l.jpg`  | 424×600    | 116 KB |
 * | MAL `<id>.jpg`   | 225×318    |  41 KB |
 * | MAL `<id>t.jpg`  | 42×59      | 3.2 KB |
 * | AniList large    | 460×651    | 103 KB |
 * | AniList medium   | 230×326    |  32 KB |
 * | AniList small    | 100×142    | 8.6 KB |
 *
 * Note how differently the two CDNs read the word "thumbnail": AniList's is
 * 100px wide and still crisp in a small row on a 2× screen, MAL's is 42px and
 * visibly soft there. So the sizes below are named for the *use*, and each CDN
 * maps to whichever rendition actually serves that use — `card` deliberately
 * resolves to MAL's medium rather than its thumbnail even in small slots,
 * because saving another 38 KB isn't worth shipping a blurry poster.
 */

/** What the image is for, not what size to fetch — see the note above. */
export type PosterUse =
  /** Blurred/decorative backdrops: resolution is irrelevant, bytes are not. */
  | "blur"
  /** Grid cells, rails, chart rows — anything up to ~230px wide. */
  | "card"
  /** The detail-page hero, where the poster is the subject. */
  | "full";

/** Rendition ladder, smallest first. Index doubles as the ordering. */
const LADDER = ["small", "medium", "large"] as const;
type Rendition = (typeof LADDER)[number];

const USE_TO_RENDITION: Record<PosterUse, Rendition> = {
  blur: "small",
  card: "medium",
  full: "large",
};

/** MAL: `.../images/anime/1540/155824l.jpg` — an optional size letter before the extension. */
const MAL_PATTERN = /^(https?:\/\/cdn\.myanimelist\.net\/.*?\/\d+)([tlv])?(\.[a-z]+)$/i;
const MAL_SUFFIX: Record<Rendition, string> = {
  small: "t",
  medium: "",
  large: "l",
};

/** AniList: `.../media/anime/cover/large/bx163270-….jpg` — size is a path segment. */
const ANILIST_PATTERN = /^(https?:\/\/[^/]*anilist[^/]*\/.*\/cover\/)(small|medium|large|extraLarge)(\/.*)$/i;
const ANILIST_SEGMENT: Record<Rendition, string> = {
  small: "small",
  medium: "medium",
  large: "large",
};

/** Where a URL already sits on the ladder, so we never rewrite *upwards*. */
function currentRendition(url: string): Rendition | null {
  const mal = MAL_PATTERN.exec(url);
  if (mal) {
    const suffix = (mal[2] ?? "").toLowerCase();
    if (suffix === "t") return "small";
    if (suffix === "l" || suffix === "v") return "large";
    return "medium";
  }
  const anilist = ANILIST_PATTERN.exec(url);
  if (anilist) {
    const seg = anilist[2]!.toLowerCase();
    if (seg === "small") return "small";
    if (seg === "medium") return "medium";
    return "large"; // large and extraLarge both sit at the top
  }
  return null;
}

/**
 * Rewrite `url` to the rendition that suits `use`.
 *
 * Two deliberate guarantees:
 *
 *  - **Unknown hosts pass through untouched.** Posters also come from Supabase
 *    storage, from catalog rows contributed by users, and from hosts we've
 *    never seen (`remotePatterns` allows any https origin). Guessing a URL
 *    shape for those would turn a working poster into a 404.
 *  - **It only ever shrinks.** Asking for `full` from an URL that is already a
 *    thumbnail returns the thumbnail, because the larger rendition may simply
 *    not exist — AniList's `extraLarge` 404s for `.jpg` covers, and inventing
 *    it would break the image rather than improve it.
 */
export function posterUrl(
  url: string | null | undefined,
  use: PosterUse,
): string | null {
  if (!url) return null;

  const current = currentRendition(url);
  if (current == null) return url;

  const wanted = USE_TO_RENDITION[use];
  // Never climb the ladder — see the guarantee above.
  if (LADDER.indexOf(wanted) >= LADDER.indexOf(current)) return url;

  const mal = MAL_PATTERN.exec(url);
  if (mal) return `${mal[1]}${MAL_SUFFIX[wanted]}${mal[3]}`;

  const anilist = ANILIST_PATTERN.exec(url);
  if (anilist) return `${anilist[1]}${ANILIST_SEGMENT[wanted]}${anilist[3]}`;

  return url;
}
