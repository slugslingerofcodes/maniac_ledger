// resolve-franchise — Supabase Edge Function (Deno runtime).
//
// Given a MyAnimeList anime id, walks the franchise graph via Jikan's
// /anime/{id}/relations endpoint — following Sequel / Prequel / Side story /
// Alternative version edges (BFS, depth ≤ 5, deduped with a Set) — and returns
// the franchise's canonical root id plus every member id.
//
// "Root" here = the smallest mal_id in the connected component. A franchise is
// an undirected component, not a tree, so there's no single graph-theoretic
// root; the minimum id is deterministic regardless of which member you start
// from, which is exactly what we need for stable grouping.
//
// Deploy:  supabase functions deploy resolve-franchise
// Invoke:  supabase.functions.invoke("resolve-franchise", { body: { malId } })
//
// Jikan is public, so this function needs no secrets/DB access.

import { z } from "npm:zod@^4";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const MAX_DEPTH = 5;

// Relation labels (lower-cased) that keep you inside the same franchise.
const FRANCHISE_RELATIONS = new Set([
  "sequel",
  "prequel",
  "side story",
  "alternative version",
]);

/* ------------------------------ rate limiting ----------------------------- */
// Jikan allows ~3 req/sec. `p-limit` caps *concurrency*, but concurrency alone
// still lets N calls fire in the same tick and blow the per-second budget, so
// this limiter is concurrency-1 *plus* a minimum interval between calls — i.e. a
// true ≤3 req/sec serial queue (same approach as the app's src/lib/jikan.ts).
const MIN_INTERVAL_MS = 350;

function createRateLimiter(minIntervalMs: number) {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = minIntervalMs - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return task();
    });
    // Keep the chain alive on rejection so one failure can't wedge the queue.
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

const limit = createRateLimiter(MIN_INTERVAL_MS);

/* --------------------------------- schemas -------------------------------- */
const RequestSchema = z.object({
  malId: z.number().int().positive(),
});

const RelationEntrySchema = z.object({
  mal_id: z.number().int(),
  type: z.string(), // "anime" | "manga"
  name: z.string(),
  url: z.string().optional(),
});

const RelationsResponseSchema = z.object({
  data: z.array(
    z.object({
      relation: z.string(), // "Sequel", "Prequel", "Side story", ...
      entry: z.array(RelationEntrySchema),
    }),
  ),
});

type Resolved = {
  rootMalId: number;
  malIds: number[];
  depthReached: number;
  truncated: boolean;
};

/* -------------------------------- core logic ------------------------------ */
async function fetchRelations(malId: number) {
  const res = await limit(() =>
    fetch(`${JIKAN_BASE}/anime/${malId}/relations`, {
      headers: { Accept: "application/json" },
    }),
  );
  if (res.status === 404) return []; // unknown id → treat as no edges
  if (!res.ok) {
    throw new Error(`Jikan relations for ${malId} failed: HTTP ${res.status}`);
  }
  return RelationsResponseSchema.parse(await res.json()).data;
}

async function resolveFranchise(startMalId: number): Promise<Resolved> {
  const visited = new Set<number>([startMalId]);
  const queue: Array<{ id: number; depth: number }> = [
    { id: startMalId, depth: 0 },
  ];
  let depthReached = 0;
  let truncated = false;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    depthReached = Math.max(depthReached, depth);

    // At the cap we stop expanding; flag that edges may exist beyond it.
    if (depth >= MAX_DEPTH) {
      truncated = true;
      continue;
    }

    const relations = await fetchRelations(id);
    for (const rel of relations) {
      if (!FRANCHISE_RELATIONS.has(rel.relation.toLowerCase())) continue;
      for (const entry of rel.entry) {
        // Relations include manga/novels; only follow anime so we never pull a
        // manga mal_id into the anime franchise.
        if (entry.type.toLowerCase() !== "anime") continue;
        if (visited.has(entry.mal_id)) continue;
        visited.add(entry.mal_id);
        queue.push({ id: entry.mal_id, depth: depth + 1 });
      }
    }
  }

  const malIds = [...visited].sort((a, b) => a - b);
  return { rootMalId: malIds[0], malIds, depthReached, truncated };
}

/* --------------------------------- handler -------------------------------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const input = RequestSchema.safeParse(body);
  if (!input.success) {
    return json({ error: "Body must be { malId: number }" }, 400);
  }

  try {
    return json(await resolveFranchise(input.data.malId), 200);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "resolve failed" },
      502,
    );
  }
});
