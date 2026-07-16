#!/usr/bin/env node
/**
 * Schema drift check: does the live database actually have what the code needs?
 *
 * Why this exists: migrations here are applied by hand, pasted into the Supabase
 * SQL editor, with nothing recording what ran. So code can ship green — `tsc`
 * and the tests both pass — and then fail at runtime because a migration was
 * never applied. This probes the real database and says which objects are
 * missing, and which migration adds them.
 *
 * How it probes: PostgREST validates `?select=…` against its schema cache, so a
 * `limit=0` request needs no rows and no session, and still fails loudly when a
 * table or column is absent. It runs with the **anon** key — the same one the
 * browser already uses — so it needs no privileged credentials and is safe to
 * run anywhere, including CI. It reads nothing: `limit=0` returns no rows, and
 * RLS applies regardless.
 *
 * Usage:
 *   npm run check:schema          # reads .env.local, or the ambient env
 *
 * Exit codes: 0 = schema matches, 1 = drift found, 2 = could not run.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What each migration adds, as objects PostgREST can see.
 *
 * **Update this when you write a migration** — it's the checklist that makes an
 * unapplied migration visible instead of a 2am runtime error. One representative
 * column per table is enough to prove the table exists; list extra columns only
 * where a later migration adds them to an existing table (that's the case this
 * catches best, since the table itself will already be there).
 *
 * Not everything is probeable this way. Realtime publications (0006), pg_cron
 * schedules (0009, 0019), storage buckets (0012), and bare constraints (0025)
 * are invisible to PostgREST's schema cache; they're listed as `unprobeable`
 * so this file stays an honest inventory rather than looking complete.
 */
export const MANIFEST = [
  { migration: "0001-0005", table: "anime", columns: ["id", "mal_id", "title", "status"] },
  { migration: "0001-0005", table: "episodes", columns: ["id", "anime_id", "number"] },
  { migration: "0001-0005", table: "user_progress", columns: ["id", "user_id", "anime_id", "status"] },
  { migration: "0001-0005", table: "episode_progress", columns: ["user_id", "episode_id"] },
  { migration: "0007", table: "anime", columns: ["franchise_id"] },
  { migration: "0008", table: "notifications", columns: ["id", "user_id"] },
  { migration: "0010", table: "recommendations", columns: ["id", "user_id", "mal_id"] },
  { migration: "0011", table: "announcements", columns: ["id", "body"] },
  { migration: "0013", table: "anime_chat_messages", columns: ["id", "anime_id"] },
  { migration: "0014", table: "anime", columns: ["genres"] },
  { migration: "0015", table: "profiles", columns: ["user_id", "username", "is_public"] },
  { migration: "0015", table: "follows", columns: ["follower_id", "followee_id"] },
  { migration: "0016", table: "lists", columns: ["id", "user_id"] },
  { migration: "0016", table: "list_items", columns: ["list_id"] },
  { migration: "0017", table: "user_progress", columns: ["rewatch_count"] },
  { migration: "0017", table: "episode_progress", columns: ["rating"] },
  { migration: "0018", table: "push_subscriptions", columns: ["endpoint"] },
  { migration: "0020", table: "friendships", columns: ["id"] },
  { migration: "0021", table: "products", columns: ["id"] },
  { migration: "0021", table: "product_requests", columns: ["id"] },
  { migration: "0022", table: "manga", columns: ["id", "mal_id", "title", "type"] },
  { migration: "0022", table: "manga_progress", columns: ["id", "chapters_read", "status"] },
  { migration: "0023", table: "user_progress", columns: ["is_private"] },
  { migration: "0024", table: "manga", columns: ["mangadex_id", "chapters_synced_at"] },
  { migration: "0024", table: "manga_chapters", columns: ["id", "manga_id"] },
  { migration: "0026", table: "http_cache", columns: ["key", "value", "expires_at"] },
];

/** Objects PostgREST cannot see; verify these by hand (see DEPLOY.md). */
export const UNPROBEABLE = [
  { migration: "0006", what: "supabase_realtime publication + REPLICA IDENTITY FULL" },
  { migration: "0009", what: "pg_cron: daily airing digest" },
  { migration: "0012", what: "storage bucket: avatars" },
  { migration: "0019", what: "pg_cron: weekly digest" },
  { migration: "0025", what: "unique constraint: manga.mangadex_id" },
  { migration: "0026", what: "pg_cron: hourly http_cache purge" },
];

/**
 * Classify one PostgREST response.
 *
 * `restricted` is the subtle one: a table with RLS on and no grants (0026's
 * http_cache) answers "permission denied", not "not found". That proves the
 * table *exists* — Postgres resolved the name before refusing — so treating it
 * as missing would report permanent false drift. Its columns stay unverified,
 * which is the honest answer for a table this key can't read.
 */
export function classify(status, body) {
  if (status >= 200 && status < 300) return { state: "ok" };
  const code = body?.code;
  if (code === "PGRST205") return { state: "missing-table", detail: body.message };
  if (code === "42703") return { state: "missing-column", detail: body.message };
  if (code === "42501") return { state: "restricted", detail: body.message };
  return { state: "unknown", detail: body?.message ?? `HTTP ${status}` };
}

/** The probe URL for one manifest entry. `limit=0` reads no rows. */
export function probeUrl(baseUrl, { table, columns }) {
  const params = new URLSearchParams({ select: columns.join(","), limit: "0" });
  return `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?${params}`;
}

/** Group results into the report the CLI prints. Pure, so it's unit-testable. */
export function summarize(results) {
  const drift = results.filter(
    (r) => r.state === "missing-table" || r.state === "missing-column",
  );
  const restricted = results.filter((r) => r.state === "restricted");
  const unknown = results.filter((r) => r.state === "unknown");
  const missingMigrations = [...new Set(drift.map((r) => r.migration))].sort();
  return { drift, restricted, unknown, missingMigrations, ok: drift.length === 0 };
}

/** Minimal .env.local reader — no dependency, and dotenv isn't installed. */
function readEnvFile(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  const fileEnv = readEnvFile(join(ROOT, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      "check-schema: need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
        "(from .env.local or the environment).",
    );
    process.exit(2);
  }

  const results = [];
  for (const entry of MANIFEST) {
    let res;
    try {
      res = await fetch(probeUrl(url, entry), { headers: { apikey: key } });
    } catch (err) {
      console.error(`check-schema: cannot reach ${url} — ${err.message}`);
      process.exit(2);
    }
    const body = res.ok ? null : await res.json().catch(() => null);
    results.push({ ...entry, ...classify(res.status, body) });
  }

  const { drift, restricted, unknown, missingMigrations, ok } = summarize(results);

  for (const r of results) {
    const label = `${r.table} (${r.migration})`;
    if (r.state === "ok") console.log(`  ok         ${label}`);
    else if (r.state === "restricted") console.log(`  restricted ${label} — exists; columns unverified`);
    else console.log(`  MISSING    ${label} — ${r.detail}`);
  }

  console.log(`\n${results.length} probes: ${results.length - drift.length - unknown.length} present, ${drift.length} missing, ${unknown.length} unknown.`);

  if (restricted.length > 0) {
    console.log(
      `\nRestricted (service-role only, existence confirmed): ${restricted.map((r) => r.table).join(", ")}`,
    );
  }
  if (unknown.length > 0) {
    console.log("\nCould not classify:");
    for (const r of unknown) console.log(`  ${r.table} (${r.migration}) — ${r.detail}`);
  }

  console.log(`\nNot probeable via PostgREST — verify by hand (DEPLOY.md):`);
  for (const u of UNPROBEABLE) console.log(`  ${u.migration}: ${u.what}`);

  if (!ok) {
    console.error(
      `\nFAIL: schema drift. Apply these migrations in the Supabase SQL editor: ${missingMigrations.join(", ")}`,
    );
    process.exit(1);
  }
  console.log("\nPASS: every probeable object the code needs is present.");
}

/**
 * True when this file was executed rather than imported, so tests can import
 * the pure helpers above without running the probes.
 *
 * `pathToFileURL` rather than string-building the URL: on Windows argv[1] is
 * `C:\…`, which hand-rolled `file://` + slash-swapping turns into a URL that
 * never matches `import.meta.url` (`file:///C:/…` — three slashes). That
 * mismatch made this script exit 0 while silently checking nothing.
 */
export function isMain(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

if (isMain()) {
  await main();
}
