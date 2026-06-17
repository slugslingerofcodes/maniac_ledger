import { NextResponse, type NextRequest } from "next/server";

// Jikan v4 — the unofficial MyAnimeList API. Docs: https://docs.api.jikan.moe/
const JIKAN_ENDPOINT = "https://api.jikan.moe/v4/anime";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const REQUEST_TIMEOUT_MS = 8000;
// Default synopsis length, keeping payloads light for autocomplete UIs.
// Pass ?full=true to receive the untruncated synopsis.
const SYNOPSIS_PREVIEW_LENGTH = 300;

// Truncate to `max` chars on a word boundary, appending an ellipsis.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

// Subset of the fields we read from each Jikan result.
interface JikanAnime {
  mal_id: number;
  title: string;
  synopsis: string | null;
  episodes: number | null;
  score: number | null;
  images?: {
    jpg?: { image_url?: string | null; large_image_url?: string | null };
  };
}

interface JikanSearchResponse {
  data?: JikanAnime[];
}

export interface AnimeSearchResult {
  malId: number;
  title: string;
  image: string | null;
  synopsis: string | null;
  episodes: number | null;
  score: number | null;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: 'Missing required query parameter "q".' },
      { status: 400 },
    );
  }

  // Optional ?limit= (1–25), defaults to 10.
  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  // Return the full synopsis only when ?full=true; otherwise send a preview.
  const full = request.nextUrl.searchParams.get("full") === "true";

  const url = new URL(JIKAN_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sfw", "true");

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      // Cache identical searches for an hour to stay within Jikan's rate limits.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof DOMException && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "The anime search request timed out. Please try again."
          : "Could not reach the anime search service.",
      },
      { status: 504 },
    );
  }

  // Jikan rate limit — surface it so the caller can back off.
  if (upstream.status === 429) {
    return NextResponse.json(
      {
        error:
          "Rate limited by the anime search service. Please try again shortly.",
      },
      { status: 429 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Anime search failed (upstream status ${upstream.status}).` },
      { status: 502 },
    );
  }

  let payload: JikanSearchResponse;
  try {
    payload = (await upstream.json()) as JikanSearchResponse;
  } catch {
    return NextResponse.json(
      { error: "Received a malformed response from the anime search service." },
      { status: 502 },
    );
  }

  const results: AnimeSearchResult[] = (payload.data ?? []).map((anime) => ({
    malId: anime.mal_id,
    title: anime.title,
    image:
      anime.images?.jpg?.large_image_url ??
      anime.images?.jpg?.image_url ??
      null,
    synopsis:
      anime.synopsis && !full
        ? truncate(anime.synopsis, SYNOPSIS_PREVIEW_LENGTH)
        : anime.synopsis ?? null,
    episodes: anime.episodes ?? null,
    score: anime.score ?? null,
  }));

  return NextResponse.json({ query: q, count: results.length, results });
}
