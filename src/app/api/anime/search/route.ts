import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { searchCatalog } from "@/lib/catalog-fallback";
import { JikanError, searchAnime, type JikanAnime } from "@/lib/jikan";

/**
 * GET /api/anime/search?q=naruto&page=1&genres=1,22
 *
 * Proxies the Jikan v4 search through our typed client (which rate-limits to
 * stay inside Jikan's ~3 req/sec budget) and edge-caches responses for an hour.
 * `genres` is a comma-separated list of MAL genre ids; with genres present,
 * `q` may be omitted (pure genre browse).
 */

// q: at least 2 chars when present. page: optional positive integer.
// genres: comma-separated positive ints, max 8. At least one of q/genres.
const QuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2, "Query must be at least 2 characters.")
      .optional(),
    page: z.coerce
      .number()
      .int("Page must be an integer.")
      .positive("Page must be a positive integer.")
      .optional()
      .default(1),
    genres: z
      .string()
      .regex(/^\d+(,\d+)*$/, "genres must be comma-separated ids.")
      .transform((s) => s.split(",").map(Number).slice(0, 8))
      .optional(),
  })
  .refine((v) => v.q != null || (v.genres?.length ?? 0) > 0, {
    message: "Provide a query or at least one genre.",
  });

/** Results per app page: two 25-result Jikan pages stitched together. */
const JIKAN_PAGES_PER_APP_PAGE = 2;

export interface AnimeSearchResponse {
  results: JikanAnime[];
  /** 1-based app page (≤50 results each). */
  page: number;
  totalPages: number;
  totalItems: number;
  /** True when MAL was unreachable and results came from the local catalog. */
  degraded?: boolean;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    genres: searchParams.get("genres") ?? undefined,
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

  const { q, page, genres } = parsed.data;

  try {
    // Stitch two Jikan pages (25 results each) into one ≤50-result app page,
    // so callers get everything matching the query with page numbers.
    const firstJikanPage = (page - 1) * JIKAN_PAGES_PER_APP_PAGE + 1;
    const first = await searchAnime(q ?? "", firstJikanPage, genres ?? []);
    let results = first.data;
    if (first.pagination.has_next_page) {
      const second = await searchAnime(
        q ?? "",
        firstJikanPage + 1,
        genres ?? [],
      );
      results = results.concat(second.data);
    }

    const totalPages = Math.max(
      1,
      Math.ceil(
        first.pagination.last_visible_page / JIKAN_PAGES_PER_APP_PAGE,
      ),
    );

    return NextResponse.json(
      {
        results,
        page,
        totalPages,
        totalItems: first.pagination.items.total,
      } satisfies AnimeSearchResponse,
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

    // Pass through Jikan's rate-limit signal so clients can back off.
    if (err instanceof JikanError && err.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by the upstream anime service. Try again shortly." },
        { status: 429 },
      );
    }

    // MAL is down — fall back to the local catalog so search keeps working
    // for known titles. Never edge-cached, so recovery isn't masked.
    try {
      const results = await searchCatalog(q ?? "", genres ?? []);
      return NextResponse.json(
        {
          results,
          page: 1,
          totalPages: 1,
          totalItems: results.length,
          degraded: true,
        } satisfies AnimeSearchResponse,
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (fallbackErr) {
      console.error("[/api/anime/search] catalog fallback failed:", fallbackErr);
    }

    return NextResponse.json(
      { error: "Failed to fetch anime search results. Please try again." },
      { status: 500 },
    );
  }
}
