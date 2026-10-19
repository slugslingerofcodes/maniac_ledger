// catalog-sync — Supabase Edge Function (Deno runtime).
//
// Keeps the shared `anime` catalog and its chart snapshots (`catalog_lists`,
// migration 0030) fresh, so pages read our own database first and treat
// Jikan/AniList as enrichment. Every six hours (pg_cron, migration 0031):
//
//   1. AniList: ~10 chart pages of 50, batched four to a GraphQL request
//      (≥2.5s apart — its limit is 30/min). Banner art, trailers, synonyms,
//      and a schedule slot from each airing show's next episode.
//   2. Jikan (MAL), at the same time: the same charts the app asks MAL for,
//      25 rows a page, one request every 400ms (its limit is ~3/s, 60/min).
//      Two consecutive no-response failures end the Jikan half of the run —
//      it has been unreachable for days at a time, and a dead host would
//      otherwise cost ~20 timeouts.
//   3. Merge per title (MAL wins where it has a value; mapping.ts), then write
//      rows in batches and the charts last, through `catalog_sync_apply`.
//
// Idempotent: rows upsert by mal_id without erasing what a sparser view lacks,
// and each chart is replaced whole. A partial run is a good outcome — any
// chart neither engine answered keeps its previous snapshot, which pages stop
// trusting after 36h.
//
// Deploy:  supabase functions deploy catalog-sync
// Invoke:  POST with `Authorization: Bearer <service-role key>` (what the
//          cron sends). Body `{"dryRun": true}` maps and reports without
//          writing. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected.

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  ANILIST_PAGES_PER_REQUEST,
  anilistCharts,
  anilistDocument,
  anilistLists,
  type AnilistChart,
  type AnilistRecord,
  type CatalogRow,
  fromAnilist,
  fromJikan,
  jikanCharts,
  jikanLists,
  type JikanChart,
  type JikanRecord,
  mergeAll,
  pickLists,
} from "./mapping.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANILIST_URL = "https://graphql.anilist.co";

/** ~2.5 req/s: under Jikan's ~3/s, and 23 calls stay under its 60/min. */
const JIKAN_SPACING_MS = 400;
/** 24/min against AniList's 30/min (its degraded-mode limit). */
const ANILIST_SPACING_MS = 2_500;
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Consecutive no-response failures before Jikan is given up on for the run. */
const JIKAN_BREAKER = 2;
/**
 * The whole run's budget. The free plan's wall clock is 150s and the cron's
 * pg_net call waits 150s; no new upstream request starts past this.
 */
const BUDGET_MS = 100_000;
const WRITE_BATCH = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces request *starts* `spacingMs` apart, like the app's jikan.ts queue. */
function spacer(spacingMs: number) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + spacingMs;
    if (at > now) await sleep(at - now);
  };
}

type Outcome<T> = { ok: true; value: T } | { ok: false; transport: boolean; detail: string };

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, transport: false, detail: `HTTP ${res.status} ${body.slice(0, 160)}` };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch (err) {
    // No HTTP response at all: DNS, connect, timeout.
    return { ok: false, transport: true, detail: err instanceof Error ? err.name : String(err) };
  }
}

/* --------------------------------- Jikan ---------------------------------- */

type JikanReport = { requests: number; ok: number; failed: number; gaveUp: string | null };

async function runJikan(now: Date, deadline: number) {
  const report: JikanReport = { requests: 0, ok: 0, failed: 0, gaveUp: null };
  const pages: { chart: JikanChart; rows: (CatalogRow | null)[] }[] = [];
  const wait = spacer(JIKAN_SPACING_MS);
  let transportFailures = 0;

  charts: for (const chart of jikanCharts(now)) {
    for (let page = 1; page <= chart.pages; page++) {
      if (Date.now() > deadline) {
        report.gaveUp ??= "time budget spent";
        break charts;
      }
      const url = `${JIKAN_BASE}${chart.path}&limit=25&page=${page}`;
      let result: Outcome<{ data?: JikanRecord[]; pagination?: { has_next_page?: boolean } }>;
      let attempt = 0;
      do {
        // One retry, after a pause, for a 429/5xx; none for a dead host.
        if (attempt > 0) await sleep(1_500);
        await wait();
        report.requests++;
        result = await fetchJson(url);
        attempt++;
      } while (!result.ok && !result.transport && attempt < 2);

      if (!result.ok) {
        report.failed++;
        transportFailures = result.transport ? transportFailures + 1 : 0;
        console.warn(`[catalog-sync] jikan ${chart.key} p${page}: ${result.detail}`);
        if (transportFailures >= JIKAN_BREAKER) {
          report.gaveUp = `unreachable (${result.detail})`;
          break charts;
        }
        // This chart is unwell; don't spend the budget on its later pages.
        continue charts;
      }
      transportFailures = 0;
      report.ok++;
      const data = Array.isArray(result.value.data) ? result.value.data : [];
      pages.push({ chart, rows: data.map(fromJikan) });
      if (data.length === 0 || result.value.pagination?.has_next_page === false) break;
    }
  }
  return { report, lists: jikanLists(pages), rows: pages.flatMap((p) => p.rows) };
}

/* -------------------------------- AniList --------------------------------- */

type AnilistReport = { requests: number; ok: number; failed: number; gaveUp: string | null };

async function runAnilist(now: Date, deadline: number) {
  const report: AnilistReport = { requests: 0, ok: 0, failed: 0, gaveUp: null };
  const pages: { chart: AnilistChart; rows: (CatalogRow | null)[] }[] = [];
  const wait = spacer(ANILIST_SPACING_MS);
  const charts = anilistCharts(now);

  for (let i = 0; i < charts.length; i += ANILIST_PAGES_PER_REQUEST) {
    if (Date.now() > deadline) {
      report.gaveUp = "time budget spent";
      break;
    }
    const batch = charts.slice(i, i + ANILIST_PAGES_PER_REQUEST);
    await wait();
    report.requests++;
    const result = await fetchJson<{
      data?: Record<string, { media?: AnilistRecord[] } | null>;
      errors?: { message?: string }[];
    }>(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: anilistDocument(batch) }),
    });

    if (!result.ok || !result.value.data) {
      report.failed++;
      const detail = result.ok ? (result.value.errors?.[0]?.message ?? "no data") : result.detail;
      console.warn(`[catalog-sync] anilist batch ${i / ANILIST_PAGES_PER_REQUEST}: ${detail}`);
      // 403 = the API is switched off service-wide (seen Aug 2026); 429 = we
      // are over budget. Either way more requests this run only make it worse.
      if (/HTTP (403|429)/.test(detail)) {
        report.gaveUp = detail.slice(0, 80);
        break;
      }
      continue;
    }
    report.ok++;
    batch.forEach((chart, j) => {
      const media = result.value.data?.[`p${j}`]?.media ?? [];
      pages.push({ chart, rows: media.map(fromAnilist) });
    });
  }
  return { report, lists: anilistLists(pages), rows: pages.flatMap((p) => p.rows) };
}

/* --------------------------------- write ---------------------------------- */

async function apply(rows: CatalogRow[], lists: ReturnType<typeof pickLists>) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const totals = { updated: 0, inserted: 0, lists: 0, failedBatches: 0 };

  // Rows first, charts last: a chart never points at titles that aren't there.
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const { data, error } = await supabase.rpc("catalog_sync_apply", {
      p_rows: rows.slice(i, i + WRITE_BATCH),
      p_lists: [],
    });
    if (error) {
      // One bad batch must not cost the others (or the charts).
      totals.failedBatches++;
      console.error(`[catalog-sync] row batch ${i / WRITE_BATCH} failed: ${error.message}`);
      continue;
    }
    totals.updated += data?.updated ?? 0;
    totals.inserted += data?.inserted ?? 0;
  }

  const { data, error } = await supabase.rpc("catalog_sync_apply", { p_rows: [], p_lists: lists });
  if (error) throw new Error(`chart write failed: ${error.message}`);
  totals.lists = data?.lists ?? 0;
  return totals;
}

/* -------------------------------- handler --------------------------------- */

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Constant-time compare: the secret here is the RLS-bypassing service key. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // Service role only: this writes the shared catalog on nobody's behalf.
  if (!timingSafeEqual(req.headers.get("Authorization") ?? "", `Bearer ${SERVICE_ROLE_KEY}`)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = (await req.json().catch(() => ({}))) as { dryRun?: unknown };
  const dryRun = body?.dryRun === true;

  const started = Date.now();
  const now = new Date();
  const deadline = started + BUDGET_MS;

  // Different hosts, different budgets: run the two halves side by side.
  const [anilist, jikan] = await Promise.all([runAnilist(now, deadline), runJikan(now, deadline)]);

  const rows = mergeAll(jikan.rows, anilist.rows);
  const lists = pickLists(jikan.lists, anilist.lists);
  const summary = {
    ms: Date.now() - started,
    jikan: jikan.report,
    anilist: anilist.report,
    rows: rows.length,
    lists: Object.fromEntries(lists.map((l) => [l.key, `${l.source}:${l.mal_ids.length}`])),
  };

  if (dryRun) return json({ dryRun: true, ...summary, sample: rows.slice(0, 3) }, 200);
  if (rows.length === 0) {
    console.error("[catalog-sync] nothing to write — both engines failed", summary);
    return json({ ok: false, ...summary }, 502);
  }

  try {
    const written = await apply(rows, lists);
    const result = { ok: written.failedBatches === 0, ...summary, written, ms: Date.now() - started };
    console.log("[catalog-sync]", JSON.stringify(result));
    return json(result, 200);
  } catch (err) {
    console.error("[catalog-sync] write failed:", err);
    return json({ ok: false, ...summary, error: err instanceof Error ? err.message : "write failed" }, 500);
  }
});
