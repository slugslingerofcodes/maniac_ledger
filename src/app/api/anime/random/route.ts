import { NextResponse } from "next/server";

import { randomCatalogAnime } from "@/lib/catalog-fallback";
import { getRandomAnime, JikanError, type JikanAnime } from "@/lib/jikan";

/**
 * GET /api/anime/random — a random SFW anime for the recommendations page's
 * "Surprise me" button. Never cached: each request is a fresh roll. When
 * MAL is unreachable, rolls from the local catalog instead (degraded: true).
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
    console.error("[/api/anime/random] upstream failure:", err);
    if (err instanceof JikanError && err.status === 429) {
      return NextResponse.json(
        { error: "Rate limited — try again in a moment." },
        { status: 429 },
      );
    }

    // MAL is down — roll from our own catalog so the button keeps working.
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
