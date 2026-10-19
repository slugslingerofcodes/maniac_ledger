import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { UNPROBEABLE } from "../../scripts/check-schema.mjs";

/**
 * Cron migrations ship with a `__PROJECT_REF__` placeholder in the Edge
 * Function URL, to be replaced before pasting. 0019 was run without replacing
 * it, and the live weekly-digest job POSTed to `__PROJECT_REF__.supabase.co`
 * for months: pg_cron logs every run as `succeeded` (that only means the
 * request was queued) and pg_net prunes the failed responses within hours.
 * 0032 repairs that job.
 *
 * The guard is a `do` block that raises while the placeholder is unreplaced.
 * This scans *every* migration, so a new cron migration that takes a project
 * ref fails here until it carries the guard too.
 */

const DIR = join(__dirname, "../../supabase/migrations");
const PLACEHOLDER = "__PROJECT_REF__";

const migrations = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({
    file,
    // 0009 keeps a commented-out alternative with the placeholder; only the
    // statements count.
    sql: readFileSync(join(DIR, file), "utf8").replace(/--.*$/gm, ""),
  }));

const needsRef = migrations.filter(({ sql }) => sql.includes(PLACEHOLDER));

const GUARD = /if\s+'__PROJECT_REF__'\s+like\s+'\\_\\_%'\s+then\s+raise\s+exception/i;

describe("migrations that take a project ref", () => {
  it("are all found (the scan itself still works)", () => {
    expect(needsRef.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        "0009_schedule_airing_notifications.sql",
        "0019_weekly_digest_cron.sql",
        "0032_fix_weekly_digest_cron.sql",
      ]),
    );
  });

  it.each(needsRef.map(({ file, sql }) => [file, sql]))(
    "%s refuses to schedule anything while __PROJECT_REF__ is unreplaced",
    (_file, sql) => {
      const guard = sql.search(GUARD);
      expect(guard, "no placeholder guard").toBeGreaterThanOrEqual(0);

      // An error aborts the rest of the script, so the guard only protects
      // what comes after it. cron.schedule overwrites a job of the same name,
      // so even a re-run must stop before it.
      const firstCronCall = sql.search(/cron\.(?:un)?schedule\s*\(/i);
      expect(firstCronCall).toBeGreaterThan(guard);
    },
  );
});

describe("0032_fix_weekly_digest_cron.sql", () => {
  const sql = needsRef.find(({ file }) => file.startsWith("0032_"))?.sql ?? "";

  it("is re-runnable: unschedules only a job that exists", () => {
    expect(sql).toMatch(
      /select\s+cron\.unschedule\('weekly-digest-monday'\)\s+where\s+exists\s*\(\s*select\s+1\s+from\s+cron\.job\s+where\s+jobname\s*=\s*'weekly-digest-monday'\s*\)/i,
    );
  });

  it("reads the key from Vault rather than inlining it", () => {
    expect(sql).toContain("from vault.decrypted_secrets");
    expect(sql).not.toMatch(/Bearer\s+ey/);
  });

  it("is listed as a manual check in check-schema", () => {
    expect(UNPROBEABLE).toContainEqual(expect.objectContaining({ migration: "0032" }));
  });
});
