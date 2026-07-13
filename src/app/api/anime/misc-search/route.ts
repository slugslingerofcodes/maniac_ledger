import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { searchAnilistAdultAnime } from "@/lib/anilist";
import { searchAdultCatalog } from "@/lib/catalog-fallback";
import {
  JikanError,
  MAL_GENRE_ECCHI,
  MAL_GENRE_HENTAI,
  searchAdultAnime,
  type JikanAnime,
} from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/anime/misc-search?q=&page=1&mode=both
 *
 * Adult (ecchi / hentai) search for the "miscellaneous" section, with SFW
 * filtering off. Unlike /api/anime/search this is **not** a public path — the
 * proxy auth gate requires a session, and this handler double-checks the user
 * so it can answer with a 401 JSON body instead of an HTML redirect.
 *
 * `mode` picks the catalog slice:
 *  - ecchi  → MAL genre 9
 *  - hentai → MAL genre 12
 *  - both   → both slices fetched and merged, ranked by member count. Two
 *             single-genre queries (not `genres=9,12`) so the result set is
 *             correct regardless of MAL's multi-genre AND/OR semantics.
 *
 * Fallback chain (same as /api/anime/search): MAL → AniList (adult genres,
 * `isAdult` not suppressed) → the local catalog (rows whose genres include
 * Ecchi/Hentai; degraded). The tab therefore stays usable through MAL outages.
 */

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().positive().max(1000).optional().default(1),
  mode: z.enum(["ecchi", "hentai", "both"]).optional().default("both"),
});

export interface MiscSearchResponse {
  results: JikanAnime[];
  page: number;
  totalPages: number;
  totalItems: number;
  /** Which engine served the results. */
  source: "mal" | "anilist" | "catalog";
  /** True when live APIs were unreachable and results came from the local catalog. */
  degraded?: boolean;
}

export async function GET(request: NextRequest) {
  // Defense in depth: the proxy already gates this path, but return JSON 401
  // (not a redirect) so the client fetch fails cleanly.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    mode: searchParams.get("mode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 },
    );
  }

  const { q, page, mode } = parsed.data;
  const query = q ?? "";
  // Adult content: never cache at the edge.
  const headers = { "Cache-Control": "no-store" };

  // ---- MAL primary. -------------------------------------------------------
  try {
    if (mode === "both") {
      const [ecchi, hentai] = await Promise.all([
        searchAdultAnime(query, page, [MAL_GENRE_ECCHI]),
        searchAdultAnime(query, page, [MAL_GENRE_HENTAI]),
      ]);
      const seen = new Set<number>();
      const results: JikanAnime[] = [];
      for (const a of [...ecchi.data, ...hentai.data]) {
        if (seen.has(a.mal_id)) continue;
        seen.add(a.mal_id);
        results.push(a);
      }
      results.sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
      return NextResponse.json(
        {
          results,
          page,
          totalPages: Math.max(
            ecchi.pagination.last_visible_page,
            hentai.pagination.last_visible_page,
            1,
          ),
          totalItems:
            ecchi.pagination.items.total + hentai.pagination.items.total,
          source: "mal",
        } satisfies MiscSearchResponse,
        { headers },
      );
    }

    const genre = mode === "ecchi" ? MAL_GENRE_ECCHI : MAL_GENRE_HENTAI;
    const res = await searchAdultAnime(query, page, [genre]);
    return NextResponse.json(
      {
        results: res.data,
        page,
        totalPages: Math.max(res.pagination.last_visible_page, 1),
        totalItems: res.pagination.items.total,
        source: "mal",
      } satisfies MiscSearchResponse,
      { headers },
    );
  } catch (err) {
    console.error("[/api/anime/misc-search] MAL failure, trying AniList:", err);

    // ---- AniList fallback. ------------------------------------------------
    try {
      const res = await searchAnilistAdultAnime(query, page, mode);
      return NextResponse.json(
        {
          results: res.data,
          page,
          totalPages: Math.max(res.pagination.last_visible_page, 1),
          totalItems: Math.max(res.pagination.items.total, res.data.length),
          source: "anilist",
        } satisfies MiscSearchResponse,
        { headers },
      );
    } catch (anilistErr) {
      console.error(
        "[/api/anime/misc-search] AniList fallback failed:",
        anilistErr,
      );
    }

    // ---- Local catalog (degraded). ----------------------------------------
    try {
      const results = await searchAdultCatalog(query, mode);
      return NextResponse.json(
        {
          results,
          page: 1,
          totalPages: 1,
          totalItems: results.length,
          source: "catalog",
          degraded: true,
        } satisfies MiscSearchResponse,
        { headers },
      );
    } catch (catalogErr) {
      console.error(
        "[/api/anime/misc-search] catalog fallback failed:",
        catalogErr,
      );
    }

    if (err instanceof JikanError && err.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by the upstream service. Try again shortly." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch results. Please try again." },
      { status: 500 },
    );
  }
}
