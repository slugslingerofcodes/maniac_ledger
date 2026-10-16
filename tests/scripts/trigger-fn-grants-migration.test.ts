import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { UNPROBEABLE } from "../../scripts/check-schema.mjs";

/**
 * A SECURITY DEFINER function in `public` is an RPC endpoint the moment it is
 * created — Supabase's default privileges grant EXECUTE to PUBLIC, anon and
 * authenticated. Migration 0029 takes the trigger functions back off the API.
 *
 * The guard that matters is the first one: it scans *every* migration, so a
 * new SECURITY DEFINER trigger function added later fails here until it is
 * revoked too, rather than waiting for someone to read the security advisor.
 */

const DIR = join(__dirname, "../../supabase/migrations");

const migrations = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({
    file,
    // Comments explain the design and name roles; only the statements count.
    sql: readFileSync(join(DIR, file), "utf8").replace(/--.*$/gm, ""),
  }));

/** `public.<name>()` for every function declared `returns trigger … security definer`. */
const definerTriggerFns = migrations.flatMap(({ sql }) =>
  [
    ...sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(\s*\)\s*returns\s+trigger([\s\S]*?)\bas\s+\$/gi,
    ),
  ]
    .filter((m) => /security\s+definer/i.test(m[2]))
    .map((m) => m[1]),
);

/** Function name → the roles some migration revokes EXECUTE from. */
const revoked = new Map<string, Set<string>>();
for (const { sql } of migrations) {
  for (const m of sql.matchAll(
    /revoke\s+execute\s+on\s+function\s+public\.(\w+)\s*\(\s*\)\s+from\s+([^;]+);/gi,
  )) {
    const roles = revoked.get(m[1]) ?? new Set<string>();
    for (const role of m[2].split(",")) roles.add(role.trim().toLowerCase());
    revoked.set(m[1], roles);
  }
}

describe("SECURITY DEFINER trigger functions", () => {
  it("are all found (the scan itself still works)", () => {
    expect(definerTriggerFns).toEqual(
      expect.arrayContaining(["touch_last_watched_at", "handle_new_user"]),
    );
  });

  it.each(definerTriggerFns)("%s() is not executable by public, anon or authenticated", (fn) => {
    // PUBLIC is required: anon and authenticated inherit its grant.
    expect([...(revoked.get(fn) ?? [])]).toEqual(
      expect.arrayContaining(["public", "anon", "authenticated"]),
    );
  });
});

describe("0029_revoke_trigger_fn_execute.sql", () => {
  it("is listed as a manual check in check-schema", () => {
    expect(UNPROBEABLE).toContainEqual(expect.objectContaining({ migration: "0029" }));
  });
});
