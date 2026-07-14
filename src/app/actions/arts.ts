"use server";

import {
  ART_CATEGORIES,
  type ArtCategory,
  type ArtPiece,
  type FanArt,
} from "@/lib/arts";

/**
 * Anime art gallery sources, fetched server-side so the browser never deals
 * with third-party CORS:
 *
 *  - nekos.best — random SFW anime art with artist attribution.
 *  - Safebooru — the fan-art board (all posts safe-rated): trending art of
 *    famous series by score, searchable by the character in the art via its
 *    tag system.
 */

export type FetchArtsResult =
  | { ok: true; arts: ArtPiece[] }
  | { ok: false; error: string };

interface NekosBestResponse {
  results?: {
    url?: string;
    artist_name?: string;
    artist_href?: string;
    source_url?: string;
  }[];
}

/** A batch of random art for a category (max 20 per request upstream). */
export async function fetchAnimeArts(
  category: ArtCategory,
  amount = 12,
): Promise<FetchArtsResult> {
  if (!ART_CATEGORIES.includes(category)) {
    return { ok: false, error: "Unknown category." };
  }
  const n = Math.min(Math.max(1, amount), 20);
  try {
    const res = await fetch(
      `https://nekos.best/api/v2/${category}?amount=${n}`,
      {
        headers: { "User-Agent": "anime-maniacs/1.0 (personal tracker)" },
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(`nekos.best ${res.status}`);
    const body = (await res.json()) as NekosBestResponse;
    const arts = (body.results ?? [])
      .filter((r): r is { url: string } & typeof r => Boolean(r.url))
      .map((r) => ({
        url: r.url,
        artistName: r.artist_name?.trim() || null,
        artistHref: r.artist_href?.trim() || null,
        sourceUrl: r.source_url?.trim() || null,
      }));
    if (arts.length === 0) throw new Error("empty result");
    return { ok: true, arts };
  } catch (err) {
    console.error("[fetchAnimeArts] failed:", err);
    return { ok: false, error: "The art gallery is unavailable right now." };
  }
}

/* -------------------------------------------------------------------------- */
/* Fan art (Safebooru)                                                        */
/* -------------------------------------------------------------------------- */

const SAFEBOORU = "https://safebooru.org";
const SB_HEADERS = { "User-Agent": "anime-maniacs/1.0 (personal tracker)" };
/** Image types the grid can render (skips webm/mp4/swf posts). */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

export type FetchFanArtsResult =
  | { ok: true; arts: FanArt[]; /** The tag actually searched, when resolved. */ tag: string | null }
  | { ok: false; error: string };

interface SbPost {
  id: number;
  sample_url?: string;
  file_url?: string;
  image?: string;
  score?: number | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Free text → the best Safebooru tag. Underscores the words, then asks the
 * tag autocomplete twice per attempt — prefix ("gojo" → "gojou_satoru") and
 * `%`-substring ("luffy" → "monkey_d._luffy") — keeping only candidates where
 * the query sits at a name-segment boundary (so "luffy" can't resolve to
 * "fluffy"), and picks the highest post count. Two-word queries also try the
 * reversed order (booru tags vary between name orders). Falls back to the
 * underscored text itself.
 */
async function resolveCharacterTag(query: string): Promise<string> {
  const words = query.trim().toLowerCase().split(/\s+/);
  const attempts = [words.join("_")];
  if (words.length === 2) attempts.push([...words].reverse().join("_"));

  let best: { value: string; count: number } | null = null;
  for (const attempt of attempts) {
    const boundary = new RegExp(`(^|[._])${escapeRegex(attempt)}`);
    for (const q of [attempt, `%${attempt}`]) {
      try {
        const res = await fetch(
          `${SAFEBOORU}/autocomplete.php?q=${encodeURIComponent(q)}`,
          { headers: SB_HEADERS, cache: "no-store" },
        );
        if (!res.ok) continue;
        const list = (await res.json()) as { label?: string; value?: string }[];
        for (const t of list) {
          if (!t.value || !boundary.test(t.value)) continue;
          const count = Number(/\((\d+)\)\s*$/.exec(t.label ?? "")?.[1] ?? 0);
          if (!best || count > best.count) best = { value: t.value, count };
        }
      } catch {
        /* autocomplete down — fall through to the raw tag */
      }
    }
  }
  return best?.value ?? attempts[0]!;
}

/**
 * Fan art from Safebooru (every post is safe-rated). With no query: trending
 * art of famous series, best-scored first. With a query: art tagged with the
 * resolved character tag. 1-based `page` for load-more.
 */
export async function fetchFanArts(
  query: string,
  page = 1,
): Promise<FetchFanArtsResult> {
  try {
    const tag = query.trim() ? await resolveCharacterTag(query) : null;
    const tags = tag ?? "sort:score:desc";
    const params = new URLSearchParams({
      page: "dapi",
      s: "post",
      q: "index",
      json: "1",
      tags,
      limit: "20",
      pid: String(Math.max(0, page - 1)),
    });
    const res = await fetch(`${SAFEBOORU}/index.php?${params.toString()}`, {
      headers: SB_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`safebooru ${res.status}`);
    const text = await res.text();
    // An empty result set comes back as an empty body, not [].
    const posts = (text.trim() ? JSON.parse(text) : []) as SbPost[];

    const arts: FanArt[] = posts
      .filter((p) => {
        const file = p.file_url ?? p.sample_url;
        return p.id != null && file && IMAGE_EXT.test(p.image ?? file);
      })
      .map((p) => ({
        id: p.id,
        url: p.sample_url ?? p.file_url!,
        fullUrl: p.file_url ?? p.sample_url!,
        postUrl: `${SAFEBOORU}/index.php?page=post&s=view&id=${p.id}`,
        score: p.score ?? null,
      }));

    return { ok: true, arts, tag };
  } catch (err) {
    console.error("[fetchFanArts] failed:", err);
    return { ok: false, error: "Fan art is unavailable right now." };
  }
}
