import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { searchAnilistManga } from "@/lib/anilist";
import { hedge, HedgeError } from "@/lib/hedge";
import { JikanUnavailableError, searchManga, type JikanManga } from "@/lib/jikan";
import { searchMangaCatalog } from "@/lib/manga-catalog-fallback";
import { searchMangaDexManga } from "@/lib/mangadex";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/manga/search?q=berserk&limit=4 — the ⌘K palette's manga lookup.
 *
 * The palette used to call the `searchMangaAction` server action. Next runs a
 * client's server actions one at a time and can't abort them, so each
 * debounced keystroke queued behind the last — and every other action the
 * page fired (an episode tick, an add-to-library) queued behind *those*. A GET
 * runs concurrently, aborts when the palette moves on, and caches client-side.
 *
 * The chain is the type-ahead's own, ordered to spend AniList last:
 *
 *   MAL, hedged by MangaDex after HEDGE_DELAY_MS → AniList → local catalog.
 *
 * `searchMangaAction` tries AniList second, which is right for the browse tabs
 * but wrong here: AniList allows 30 requests a minute for the *whole app*, and
 * when Jikan is down the anime half of the palette already needs one per
 * keystroke. MangaDex has its own, far roomier budget and also carries titles
 * MAL lacks (they open on /manga/md/[id]). AniList still backs both up, through
 * a request signal so an abandoned keystroke gives its slot back.
 *
 * Authenticated (not in PUBLIC_PATHS): only signed-in layouts mount the palette,
 * and the catalog tier is RLS-gated to signed-in users anyway.
 */

const QuerySchema = z.object({
  q: z.string().trim().min(2, "Query must be at least 2 characters.").max(100),
  limit: z.coerce.number().int().min(1).max(25).optional().default(4),
});

/** Same budget as the anime palette path (see that route's HEDGE_DELAY_MS). */
const HEDGE_DELAY_MS = 1_200;

/** Per-IP ceiling, mirroring /api/anime/search. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export type MangaSearchSource = "mal" | "mangadex" | "anilist" | "catalog";

export interface MangaPaletteResponse {
  results: JikanManga[];
  source: MangaSearchSource;
  /** True when every live engine was unreachable (local-catalog results). */
  degraded?: boolean;
}

/** Dedupe by mal_id, or mangadex_id for MAL-less titles; drop rows with neither. */
function dedupe(list: JikanManga[]): JikanManga[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key =
      m.mal_id != null ? `mal:${m.mal_id}` : m.mangadex_id ? `md:${m.mangadex_id}` : null;
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const verdict = checkRateLimit(`manga-search:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many searches. Please slow down and try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(verdict.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const { searchParams } = request.nextUrl;
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
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
  const { q, limit } = parsed.data;

  const respond = (results: JikanManga[], source: MangaSearchSource) =>
    NextResponse.json(
      { results: dedupe(results).slice(0, limit), source } satisfies MangaPaletteResponse,
      // Per-user (the request is session-gated), so never shared — but the
      // same browser repeating a query within minutes needn't leave the tab.
      { headers: { "Cache-Control": "private, max-age=300" } },
    );

  try {
    const outcome = await hedge(
      () => searchManga(q, 1, [], undefined, limit),
      // The request's signal: when the palette moves on to the next keystroke
      // it aborts this fetch, and a MangaDex call still waiting for its queue
      // slot withdraws instead of spending ~1s on an answer nobody will read.
      () => searchMangaDexManga(q, 1, undefined, { signal: request.signal }),
      { delayMs: HEDGE_DELAY_MS },
    );
    return outcome.winner === "primary"
      ? respond(outcome.value.data, "mal")
      : respond(outcome.value.results, "mangadex");
  } catch (err) {
    if (err instanceof HedgeError) {
      // A circuit-open rejection was already logged once, when it opened.
      if (!(err.primaryError instanceof JikanUnavailableError)) {
        console.error("[/api/manga/search] MAL failure:", err.primaryError);
      }
      console.error("[/api/manga/search] MangaDex failure:", err.backupError);
    }
  }

  try {
    const res = await searchAnilistManga(q, 1, undefined, [], {
      signal: request.signal,
    });
    return respond(res.data, "anilist");
  } catch (err) {
    console.error("[/api/manga/search] AniList fallback failed:", err);
  }

  try {
    const results = await searchMangaCatalog(q, undefined, [], limit);
    return NextResponse.json(
      {
        results: dedupe(results).slice(0, limit),
        source: "catalog",
        degraded: true,
      } satisfies MangaPaletteResponse,
      // Never cached: a degraded answer must not outlive the outage.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/manga/search] catalog fallback failed:", err);
    return NextResponse.json(
      { error: "Manga search is unavailable right now." },
      { status: 503 },
    );
  }
}
