import { cache } from "react";

import {
  catalogRowsToJikan,
  RPC_MISSING,
  RPC_MISSING_RETRY_MS,
} from "@/lib/catalog-fallback";
import type { Tables } from "@/lib/database.types";
import type { JikanAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * The first tier of every browse surface: chart snapshots the catalog-sync
 * Edge Function writes every six hours (`catalog_lists`, migration 0030).
 *
 * A rail used to ask MAL, then AniList, then fall back to "the catalog's
 * best-scored rows". Now it reads the chart as the sync last saw it — one
 * query, ranked exactly as the upstream ranked it, with the banner art and
 * trailers the sync collected — and only asks a live engine when there is no
 * snapshot young enough to trust.
 *
 * Freshness is decided in the database: `catalog_list` returns nothing for a
 * snapshot older than `maxAge`, so a sync that silently stops degrades to the
 * live engines instead of serving last month's "airing now" forever. The
 * `stale` variant is the other end of that bargain — the tier *after* the live
 * engines, where an old chart beats an empty rail.
 */

/** Same keys as LIST_KEYS in supabase/functions/catalog-sync/mapping.ts (a test pins it). */
export const CATALOG_LIST_KEYS = [
  "airing",
  "season-now",
  "popular",
  "top-rated",
  "upcoming",
  "top-movies",
  "just-finished",
  "top10-weekly",
  "top10-monthly",
  "top10-yearly",
  "schedule",
] as const;
export type CatalogListKey = (typeof CATALOG_LIST_KEYS)[number];

/**
 * A snapshot is trusted for this long. The sync runs every 6h, so five runs in
 * a row can fail before a page falls back to the live engines.
 */
export const FRESH_MAX_AGE = "36 hours";
/** The last-resort tier keeps an old chart up rather than an empty rail. */
export const STALE_MAX_AGE = "30 days";

type AnimeRow = Tables<"anime">;

/** Until 0030 is applied there is no `catalog_list`; don't ask every render. */
let listRpcMissingUntil = 0;

/** Forget a remembered missing RPC. Tests only. */
export function __resetCatalogListMemo(): void {
  listRpcMissingUntil = 0;
}

/**
 * Memoized per request: the banner and the "Airing now" row share one chart,
 * and every rail's fresh/stale pair would otherwise be a query each.
 */
const readList = cache(
  async (key: CatalogListKey, limit: number, maxAge: string): Promise<JikanAnime[]> => {
    if (Date.now() < listRpcMissingUntil) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("catalog_list", {
      list_key: key,
      max_results: limit,
      max_age: maxAge,
    });
    // Before 0030 is applied the RPC doesn't exist; that's "no snapshot".
    if (error?.code === RPC_MISSING) listRpcMissingUntil = Date.now() + RPC_MISSING_RETRY_MS;
    if (error || !Array.isArray(data)) return [];
    return catalogRowsToJikan(data as unknown as AnimeRow[]);
  },
);

/**
 * One chart from the catalog, in chart order, or [] when there is no snapshot
 * younger than `maxAge` (or it can't be read). Never throws.
 */
export async function getCatalogList(
  key: CatalogListKey,
  limit = 50,
  { maxAge = FRESH_MAX_AGE }: { maxAge?: string } = {},
): Promise<JikanAnime[]> {
  try {
    return await readList(key, limit, maxAge);
  } catch (err) {
    console.error(`[catalog] reading ${key} failed:`, err);
    return [];
  }
}

/** The same chart with the freshness bar lowered to a month: the tier after the live engines. */
export function getStaleCatalogList(key: CatalogListKey, limit = 50): Promise<JikanAnime[]> {
  return getCatalogList(key, limit, { maxAge: STALE_MAX_AGE });
}
