import { NextResponse } from "next/server";

import { randomAnilistAnime } from "@/lib/anilist";
import { randomCatalogAnime } from "@/lib/catalog-fallback";
import { getRandomAnime, JikanError, type JikanAnime } from "@/lib/jikan";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

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

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function GET() {
  // Each roll can miss the cache and hit the 350ms-spaced upstream queue, so an
  // unlimited caller here starves every other request on the instance. The
  // proxy gates the path; this returns a clean JSON 401 rather than a redirect.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const verdict = checkRateLimit(`random:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Rolling too fast. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(verdict.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

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
