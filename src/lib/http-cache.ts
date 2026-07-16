import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Durable, cross-instance cache for upstream API responses, backed by the
 * `http_cache` table (migration 0026).
 *
 * Why this tier exists: `jikan.ts` caches in-process, which is fast but dies
 * with the serverless instance — every cold start re-pays ~20 serial calls
 * through a 350ms rate-limit queue. This table is shared by every instance and
 * outlives them all, so a cold start serves warm data.
 *
 * **Never put user data here.** This module holds the service-role key, which
 * bypasses RLS completely, so it is deliberately scoped to one table of public
 * catalog data and exposes only get/set by key. The table itself has RLS on
 * with no policies and no grants (see 0026), so `anon`/`authenticated` cannot
 * reach it even with the anon key — a cache any user could write would let one
 * poisoned row be served to everyone as though it came from MAL.
 *
 * Server-only: `SUPABASE_SERVICE_ROLE_KEY` must never reach the browser. Every
 * runtime importer of `jikan.ts` (and therefore of this module) is server-side.
 *
 * Fails soft, always. A cache is an optimisation, so every error path here
 * returns "miss" rather than throwing: if the table is absent (migration not
 * applied), the key is unset, or Postgres is unreachable, the caller simply
 * goes to the network. Degraded, never broken.
 */

/** How the shared tier answers a lookup. `expiresAt` is epoch ms. */
export type SharedCacheHit<T> = { value: T; expiresAt: number };

type CacheClient = SupabaseClient<Database>;

/**
 * Lazily-built service-role client, or null when the key isn't configured.
 * `undefined` means "not yet resolved" so a missing key is only logged once.
 */
let client: CacheClient | null | undefined;

function getClient(): CacheClient | null {
  if (client !== undefined) return client;

  try {
    // Reuses the one place that builds a service-role client. It throws when
    // SUPABASE_SERVICE_ROLE_KEY is unset, which for the /admin dashboard is a
    // real error — here it just means the shared tier is off, so the app runs
    // exactly as it did before on the in-process cache alone.
    client = createAdminClient();
  } catch {
    console.warn(
      "[http-cache] SUPABASE_SERVICE_ROLE_KEY not set — shared cache disabled, using in-memory only.",
    );
    client = null;
  }
  return client;
}

/** Reset the memoized client. Tests only. */
export function __resetHttpCacheClient() {
  client = undefined;
}

/**
 * Look up a live (unexpired) entry. Returns undefined on a miss, on an expired
 * row, or on any failure — all of which mean "go to the network".
 *
 * Expiry is filtered in SQL rather than trusted from the row, so a clock skew
 * or a stalled purge can't serve stale data.
 */
export async function sharedCacheGet<T>(
  key: string,
): Promise<SharedCacheHit<T> | undefined> {
  const supabase = getClient();
  if (!supabase) return undefined;

  try {
    const { data, error } = await supabase
      .from("http_cache")
      .select("value, expires_at")
      .eq("key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return undefined;
    return {
      value: data.value as T,
      expiresAt: new Date(data.expires_at).getTime(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Store a value for `ttlSeconds`, replacing any existing entry for the key.
 *
 * Callers should not await this on the request path — a cache write must never
 * be what a user waits for. Rejections are swallowed for the same reason.
 */
export async function sharedCacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  try {
    await supabase.from("http_cache").upsert(
      {
        key,
        value: value as Database["public"]["Tables"]["http_cache"]["Insert"]["value"],
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* A failed cache write is not a failed request. */
  }
}
