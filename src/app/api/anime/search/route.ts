import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  AnilistError,
  searchAnilist,
  type AnilistSearchFilters,
} from "@/lib/anilist";
import { searchCatalog } from "@/lib/catalog-fallback";
import {
  JikanError,
  searchAnime,
  type JikanAnime,
  type JikanSearchOptions,
} from "@/lib/jikan";
import {
  COUNTRY_OPTIONS,
  FORMAT_OPTIONS,
  SEASONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  STREAMING_OPTIONS,
  TAG_OPTIONS,
  type CountryValue,
  type FormatValue,
  type Season,
  type SourceValue,
  type StatusValue,
  type StreamingValue,
  type TagValue,
} from "@/lib/search-filters";

/**
 * GET /api/anime/search?q=naruto&page=1&genres=1,22&year=2024&format=tv&…
 *
 * Filtered anime search. MAL (Jikan) is the primary engine; AniList is the
 * backup and the engine for filters MAL can't express:
 *
 *  - MAL-capable: q, genres, format, status, year, min_year/max_year.
 *  - AniList-only: season, streaming, country, source, min_ep/max_ep,
 *    min_dur/max_dur, doujin, tags — any of these routes the query to AniList.
 *
 * Fallback chain when the primary engine fails: Jikan → AniList → the local
 * catalog (degraded). Responses carry `source` so the UI can say where the
 * results came from.
 */

const FORMAT_VALUES = new Set<string>(FORMAT_OPTIONS.map((f) => f.value));
const STATUS_VALUES = new Set<string>(STATUS_OPTIONS.map((s) => s.value));
const STREAMING_VALUES = new Set<string>(STREAMING_OPTIONS);
const COUNTRY_VALUES = new Set<string>(COUNTRY_OPTIONS.map((c) => c.value));
const SOURCE_VALUES = new Set<string>(SOURCE_OPTIONS.map((s) => s.value));
const TAG_VALUES = new Set<string>(TAG_OPTIONS);

const inSet = (set: Set<string>, label: string) =>
  z
    .string()
    .optional()
    .refine((v) => v == null || set.has(v), `Unknown ${label}.`);

const optionalInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional();

// At least one of q / genres / any filter must be present.
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
    year: optionalInt(1900, 2100),
    season: z.enum(SEASONS).optional(),
    format: inSet(FORMAT_VALUES, "format"),
    status: inSet(STATUS_VALUES, "status"),
    streaming: inSet(STREAMING_VALUES, "streaming service"),
    country: inSet(COUNTRY_VALUES, "country"),
    source: inSet(SOURCE_VALUES, "source material"),
    min_year: optionalInt(1900, 2100),
    max_year: optionalInt(1900, 2100),
    min_ep: optionalInt(0, 10_000),
    max_ep: optionalInt(0, 10_000),
    min_dur: optionalInt(0, 10_000),
    max_dur: optionalInt(0, 10_000),
    doujin: z.enum(["true"]).optional(),
    // Unknown tag names are dropped (never forwarded), capped at 5.
    tags: z
      .string()
      .transform((s) =>
        s
          .split(",")
          .filter((t) => TAG_VALUES.has(t))
          .slice(0, 5),
      )
      .optional(),
  })
  .refine(
    (v) =>
      v.q != null ||
      (v.genres?.length ?? 0) > 0 ||
      v.year != null ||
      v.season != null ||
      v.format != null ||
      v.status != null ||
      v.streaming != null ||
      v.country != null ||
      v.source != null ||
      v.min_year != null ||
      v.max_year != null ||
      v.min_ep != null ||
      v.max_ep != null ||
      v.min_dur != null ||
      v.max_dur != null ||
      v.doujin != null ||
      (v.tags?.length ?? 0) > 0,
    { message: "Provide a query or at least one filter." },
  );

/** Results per app page: two 25-result Jikan pages stitched together. */
const JIKAN_PAGES_PER_APP_PAGE = 2;

/**
 * AniList hard-caps `Page.pageInfo.total` at 5000 (→ exactly 100 pages of 50).
 * So any broad AniList browse reports the same 5000/100 regardless of the real
 * size — we surface that as an approximate "5,000+" instead of a precise
 * (and misleading, constant-looking) count.
 */
const ANILIST_MAX_TOTAL = 5000;

export type SearchSource = "mal" | "anilist" | "catalog";

export interface AnimeSearchResponse {
  results: JikanAnime[];
  /** 1-based app page (≤50 results each). */
  page: number;
  totalPages: number;
  totalItems: number;
  /** Which engine served the results. */
  source: SearchSource;
  /** True when the count is an engine cap (show "N+"), not an exact total. */
  approxTotal?: boolean;
  /** True when live APIs were unreachable and results came from the local catalog. */
  degraded?: boolean;
}

const CACHE_HEADERS = {
  // Cache at the edge for 1 hour; serve stale up to a day while revalidating.
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    genres: searchParams.get("genres") ?? undefined,
    year: searchParams.get("year") ?? undefined,
    season: searchParams.get("season") ?? undefined,
    format: searchParams.get("format") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    streaming: searchParams.get("streaming") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    min_year: searchParams.get("min_year") ?? undefined,
    max_year: searchParams.get("max_year") ?? undefined,
    min_ep: searchParams.get("min_ep") ?? undefined,
    max_ep: searchParams.get("max_ep") ?? undefined,
    min_dur: searchParams.get("min_dur") ?? undefined,
    max_dur: searchParams.get("max_dur") ?? undefined,
    doujin: searchParams.get("doujin") ?? undefined,
    tags: searchParams.get("tags") ?? undefined,
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

  const f = parsed.data;
  const page = f.page;
  const genres = f.genres ?? [];
  const tags = f.tags ?? [];

  const anilistFilters: AnilistSearchFilters = {
    query: f.q,
    genreIds: genres,
    tags: tags as TagValue[],
    season: f.season as Season | undefined,
    year: f.year,
    format: f.format as FormatValue | undefined,
    status: f.status as StatusValue | undefined,
    streaming: f.streaming as StreamingValue | undefined,
    country: f.country as CountryValue | undefined,
    source: f.source as SourceValue | undefined,
    minYear: f.min_year,
    maxYear: f.max_year,
    minEpisodes: f.min_ep,
    maxEpisodes: f.max_ep,
    minDuration: f.min_dur,
    maxDuration: f.max_dur,
    doujin: f.doujin === "true",
  };

  // Filters MAL/Jikan cannot express → the query must run on AniList.
  const anilistOnly =
    f.season != null ||
    f.streaming != null ||
    f.country != null ||
    f.source != null ||
    f.min_ep != null ||
    f.max_ep != null ||
    f.min_dur != null ||
    f.max_dur != null ||
    f.doujin != null ||
    tags.length > 0;

  /**
   * Enrich page-1 text-query results with local-catalog substring matches the
   * live engine missed. AniList's SEARCH_MATCH only matches whole tokens
   * ("naruto" works, "narut" returns nothing), so typing letters progressively
   * would otherwise dead-end. The catalog is matched with `ilike %q%` (true
   * substring) and appended, deduped by mal_id. Best-effort; only on page 1.
   */
  async function mergeCatalog(results: JikanAnime[]): Promise<JikanAnime[]> {
    if (!f.q || page !== 1) return results;
    try {
      const catalog = await searchCatalog(f.q, genres);
      if (catalog.length === 0) return results;
      const seen = new Set(results.map((r) => r.mal_id));
      const extra = catalog.filter((c) => !seen.has(c.mal_id));
      // Catalog substring hits go first when the live engine found nothing
      // (e.g. a partial prefix) so the obvious match isn't buried.
      return results.length === 0 ? extra : [...results, ...extra];
    } catch {
      return results;
    }
  }

  async function fromAnilist(): Promise<NextResponse> {
    const res = await searchAnilist(anilistFilters, page);
    const results = await mergeCatalog(res.data);
    const rawTotal = res.pagination.items.total;
    const approxTotal = rawTotal >= ANILIST_MAX_TOTAL;
    return NextResponse.json(
      {
        results,
        page,
        totalPages: res.pagination.last_visible_page,
        totalItems: Math.max(rawTotal, results.length),
        source: "anilist",
        approxTotal,
      } satisfies AnimeSearchResponse,
      { headers: CACHE_HEADERS },
    );
  }

  async function fromCatalog(): Promise<NextResponse | null> {
    // Local catalog understands only title + genres; never edge-cached so
    // recovery isn't masked.
    try {
      const results = await searchCatalog(f.q ?? "", genres);
      return NextResponse.json(
        {
          results,
          page: 1,
          totalPages: 1,
          totalItems: results.length,
          source: "catalog",
          degraded: true,
        } satisfies AnimeSearchResponse,
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (err) {
      console.error("[/api/anime/search] catalog fallback failed:", err);
      return null;
    }
  }

  // ---- AniList-required filters: skip Jikan entirely. --------------------
  if (anilistOnly) {
    try {
      return await fromAnilist();
    } catch (err) {
      console.error("[/api/anime/search] AniList failure:", err);
      if (err instanceof AnilistError && err.status === 429) {
        return NextResponse.json(
          { error: "Rate limited by AniList. Try again shortly." },
          { status: 429 },
        );
      }
      // The catalog can't express these filters, so don't return mismatched
      // results — fail honestly.
      return NextResponse.json(
        { error: "Advanced filtering is temporarily unavailable. Try again shortly." },
        { status: 502 },
      );
    }
  }

  // ---- MAL primary. -------------------------------------------------------
  try {
    const jikanOpts: JikanSearchOptions = {
      type: f.format
        ? FORMAT_OPTIONS.find((o) => o.value === f.format)?.jikan
        : undefined,
      status: f.status
        ? STATUS_OPTIONS.find((o) => o.value === f.status)?.jikan
        : undefined,
      startDate:
        f.year != null
          ? `${f.year}-01-01`
          : f.min_year != null
            ? `${f.min_year}-01-01`
            : undefined,
      endDate:
        f.year != null
          ? `${f.year}-12-31`
          : f.max_year != null
            ? `${f.max_year}-12-31`
            : undefined,
    };

    // Stitch two Jikan pages (25 results each) into one ≤50-result app page,
    // so callers get everything matching the query with page numbers.
    const firstJikanPage = (page - 1) * JIKAN_PAGES_PER_APP_PAGE + 1;
    const first = await searchAnime(f.q ?? "", firstJikanPage, genres, jikanOpts);
    let results = first.data;
    if (first.pagination.has_next_page) {
      const second = await searchAnime(
        f.q ?? "",
        firstJikanPage + 1,
        genres,
        jikanOpts,
      );
      results = results.concat(second.data);
    }

    const totalPages = Math.max(
      1,
      Math.ceil(first.pagination.last_visible_page / JIKAN_PAGES_PER_APP_PAGE),
    );

    const merged = await mergeCatalog(results);

    return NextResponse.json(
      {
        results: merged,
        page,
        totalPages,
        totalItems: Math.max(first.pagination.items.total, merged.length),
        source: "mal",
      } satisfies AnimeSearchResponse,
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    // Log the real cause server-side, but never leak it to the client.
    console.error("[/api/anime/search] MAL failure, trying AniList:", err);

    // MAL is down (or throttling us) — re-run the same search on AniList.
    try {
      return await fromAnilist();
    } catch (anilistErr) {
      console.error("[/api/anime/search] AniList fallback failed:", anilistErr);
    }

    // Both live APIs down — the local catalog keeps known titles searchable.
    const catalogRes = await fromCatalog();
    if (catalogRes) return catalogRes;

    // Pass through Jikan's rate-limit signal so clients can back off.
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
