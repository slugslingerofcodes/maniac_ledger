import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { JikanError, searchAnime, type JikanAnime } from "@/lib/jikan";

/**
 * GET /api/anime/search?q=naruto&page=1
 *
 * Proxies the Jikan v4 search through our typed client (which rate-limits to
 * stay inside Jikan's ~3 req/sec budget) and edge-caches responses for an hour.
 */

// q: at least 2 chars. page: optional positive integer, defaults to 1.
const QuerySchema = z.object({
  q: z.string().trim().min(2, "Query must be at least 2 characters."),
  page: z.coerce
    .number()
    .int("Page must be an integer.")
    .positive("Page must be a positive integer.")
    .optional()
    .default(1),
});

export interface AnimeSearchResponse {
  results: JikanAnime[];
  pagination: Awaited<ReturnType<typeof searchAnime>>["pagination"];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters.",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const { q, page } = parsed.data;

  try {
    const { data, pagination } = await searchAnime(q, page);

    return NextResponse.json(
      { results: data, pagination } satisfies AnimeSearchResponse,
      {
        headers: {
          // Cache at the edge for 1 hour; serve stale up to a day while
          // revalidating in the background.
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    // Log the real cause server-side, but never leak it to the client.
    console.error("[/api/anime/search] upstream failure:", err);

    // Pass through Jikan's rate-limit signal so clients can back off; everything
    // else collapses to a generic 500.
    if (err instanceof JikanError && err.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by the upstream anime service. Try again shortly." },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch anime search results. Please try again." },
      { status: 500 },
    );
  }
}
