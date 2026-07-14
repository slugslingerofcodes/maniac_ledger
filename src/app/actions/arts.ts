"use server";

import { ART_CATEGORIES, type ArtCategory, type ArtPiece } from "@/lib/arts";

/**
 * Anime art gallery source — nekos.best (free, SFW-only anime artwork with
 * artist attribution). Fetched server-side so the browser never deals with
 * third-party CORS. Uncached: every load should bring fresh art.
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
