import { NextResponse } from "next/server";

import { getRandomAnime, JikanError, type JikanAnime } from "@/lib/jikan";

/**
 * GET /api/anime/random — a random SFW anime for the recommendations page's
 * "Surprise me" button. Never cached: each request is a fresh roll.
 */

export interface RandomAnimeResponse {
  anime: JikanAnime;
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
    return NextResponse.json(
      { error: "Couldn't fetch a random anime. Please try again." },
      { status: 500 },
    );
  }
}
