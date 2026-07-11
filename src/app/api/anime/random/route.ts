import { NextResponse } from "next/server";

import { randomAnilistAnime } from "@/lib/anilist";
import { randomCatalogAnime } from "@/lib/catalog-fallback";
import { getRandomAnime, JikanError, type JikanAnime } from "@/lib/jikan";

/**
 * GET /api/anime/random — a random SFW anime for the recommendations page's
 * "Surprise me" button. Never cached: each request is a fresh roll. When
 * MAL is unreachable, rolls from AniList's popularity pool, and if that is
 * down too, from the local catalog (degraded: true).
 */

export interface RandomAnimeResponse {
  anime: JikanAnime;
  /** True when the roll came from the local catalog (MAL unreachable). */
  degraded?: boolean;
}

export async function GET() {
  try {
    const anime = await getRandomAnime();
    return NextResponse.json({ anime } satisfies RandomAnimeResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/anime/random] MAL failure, trying AniList:", err);

    // MAL is down (or throttling) — roll from AniList's popularity pool.
    try {
      const anime = await randomAnilistAnime();
      return NextResponse.json({ anime } satisfies RandomAnimeResponse, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (anilistErr) {
      console.error("[/api/anime/random] AniList fallback failed:", anilistErr);
    }

    if (err instanceof JikanError && err.status === 429) {
      return NextResponse.json(
        { error: "Rate limited — try again in a moment." },
        { status: 429 },
      );
    }

    // Both live APIs down — roll from our own catalog so the button keeps working.
    try {
      const anime = await randomCatalogAnime();
      if (anime) {
        return NextResponse.json(
          { anime, degraded: true } satisfies RandomAnimeResponse,
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch (fallbackErr) {
      console.error("[/api/anime/random] catalog fallback failed:", fallbackErr);
    }

    return NextResponse.json(
      { error: "Couldn't fetch a random anime. Please try again." },
      { status: 500 },
    );
  }
}
