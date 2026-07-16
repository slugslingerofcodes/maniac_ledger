import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MANIFEST,
  UNPROBEABLE,
  classify,
  isMain,
  probeUrl,
  summarize,
} from "../../scripts/check-schema.mjs";

/**
 * The schema drift check.
 *
 * A checker that silently passes is worse than no checker — it converts an
 * unapplied migration from a loud 2am error into a green build. That failure
 * mode already happened once here (the `isMain` guard never matched on Windows,
 * so the script exited 0 having probed nothing), which is why the guard and the
 * response classification are both pinned below.
 */

type Probe = { migration: string; table: string; columns: string[] };
type Result = Probe & { state: string; detail?: string };

const probe = (over: Partial<Result> = {}): Result => ({
  migration: "0026",
  table: "http_cache",
  columns: ["key"],
  state: "ok",
  ...over,
});

describe("classify", () => {
  it("treats any 2xx as present", () => {
    expect(classify(200, null)).toEqual({ state: "ok" });
  });

  it("reads PGRST205 as a missing table", () => {
    const body = {
      code: "PGRST205",
      message: "Could not find the table 'public.nope' in the schema cache",
    };

    expect(classify(404, body)).toMatchObject({ state: "missing-table" });
  });

  it("reads 42703 as a missing column", () => {
    // The case that catches a half-applied migration: table's there, the
    // column a later migration adds isn't.
    const body = { code: "42703", message: "column anime.genres does not exist" };

    expect(classify(400, body)).toMatchObject({ state: "missing-column" });
  });

  it("reads 42501 as present-but-restricted, not missing", () => {
    // http_cache has RLS on with no grants, so the anon key is refused —
    // but Postgres resolved the name first, which proves the table exists.
    // Calling this "missing" would report drift that can never be fixed.
    const body = { code: "42501", message: "permission denied for table http_cache" };

    expect(classify(401, body)).toMatchObject({ state: "restricted" });
  });

  it("falls back to unknown for an unrecognised error", () => {
    expect(classify(500, { code: "XX000", message: "boom" })).toMatchObject({
      state: "unknown",
      detail: "boom",
    });
  });

  it("describes an unknown failure with no body at all", () => {
    expect(classify(502, null)).toEqual({ state: "unknown", detail: "HTTP 502" });
  });

  it("carries the upstream message through, so the report is actionable", () => {
    const body = { code: "42703", message: "column follows.following_id does not exist" };

    expect(classify(400, body).detail).toBe("column follows.following_id does not exist");
  });
});

describe("probeUrl", () => {
  it("asks for zero rows, so the check reads no data", () => {
    // The check must be safe to run anywhere; it verifies shape, not content.
    const url = new URL(probeUrl("https://p.supabase.co", { table: "anime", columns: ["id"] }));

    expect(url.searchParams.get("limit")).toBe("0");
  });

  it("names every expected column, so a missing one errors", () => {
    const url = new URL(
      probeUrl("https://p.supabase.co", { table: "anime", columns: ["id", "genres"] }),
    );

    expect(url.searchParams.get("select")).toBe("id,genres");
  });

  it("targets the table's REST endpoint", () => {
    const url = probeUrl("https://p.supabase.co", { table: "manga_chapters", columns: ["id"] });

    expect(url).toContain("/rest/v1/manga_chapters?");
  });

  it("tolerates a base URL with a trailing slash", () => {
    const url = probeUrl("https://p.supabase.co/", { table: "anime", columns: ["id"] });

    expect(url).toContain("https://p.supabase.co/rest/v1/anime");
  });
});

describe("summarize", () => {
  it("passes when everything is present", () => {
    const s = summarize([probe(), probe({ state: "ok" })]);

    expect(s.ok).toBe(true);
    expect(s.missingMigrations).toEqual([]);
  });

  it("fails on a missing table", () => {
    expect(summarize([probe({ state: "missing-table" })]).ok).toBe(false);
  });

  it("fails on a missing column", () => {
    expect(summarize([probe({ state: "missing-column" })]).ok).toBe(false);
  });

  it("names the migrations to apply, deduped and ordered", () => {
    const s = summarize([
      probe({ migration: "0024", state: "missing-table" }),
      probe({ migration: "0016", state: "missing-column" }),
      probe({ migration: "0024", state: "missing-table" }),
    ]);

    expect(s.missingMigrations).toEqual(["0016", "0024"]);
  });

  it("does not fail on a restricted table", () => {
    // Otherwise the service-role-only cache table would fail the check forever.
    const s = summarize([probe({ state: "restricted" })]);

    expect(s.ok).toBe(true);
    expect(s.restricted).toHaveLength(1);
  });

  it("reports an unknown result without calling it drift", () => {
    const s = summarize([probe({ state: "unknown" })]);

    expect(s.ok).toBe(true);
    expect(s.unknown).toHaveLength(1);
  });
});

describe("isMain", () => {
  // Real paths from whatever platform the suite runs on. Hard-coding a
  // `C:\…` or `/home/…` string would just move the platform bug into the test:
  // each form only round-trips on its own OS.
  const scriptPath = fileURLToPath(new URL("../../scripts/check-schema.mjs", import.meta.url));
  const scriptUrl = pathToFileURL(scriptPath).href;

  it("runs when the script is invoked directly", () => {
    // The original guard hand-built `file://` + swapped slashes. On Windows
    // that yields `file://C:/…` against an actual `file:///C:/…`, so it never
    // matched and the check exited 0 having probed nothing.
    expect(isMain(scriptPath, scriptUrl)).toBe(true);
  });

  it("does not run when imported by another module", () => {
    const otherPath = fileURLToPath(new URL("../../scripts/other.mjs", import.meta.url));

    expect(isMain(otherPath, scriptUrl)).toBe(false);
  });

  it("does not run without an argv entry", () => {
    expect(isMain(undefined, scriptUrl)).toBe(false);
  });
});

describe("the manifest", () => {
  it("covers every table the app's own types declare", () => {
    // The manifest is hand-maintained alongside database.types.ts; this is the
    // nudge when a new table lands in one and not the other.
    const tables = new Set(MANIFEST.map((m: Probe) => m.table));

    for (const expected of [
      "anime",
      "episodes",
      "user_progress",
      "episode_progress",
      "notifications",
      "recommendations",
      "manga",
      "manga_progress",
      "http_cache",
    ]) {
      expect(tables, `manifest is missing ${expected}`).toContain(expected);
    }
  });

  it("gives every entry a migration and at least one column", () => {
    for (const entry of MANIFEST as Probe[]) {
      expect(entry.migration, `${entry.table} has no migration`).toBeTruthy();
      expect(entry.columns.length, `${entry.table} has no columns`).toBeGreaterThan(0);
    }
  });

  it("records the objects PostgREST cannot see, rather than pretending to cover them", () => {
    const migrations = UNPROBEABLE.map((u: { migration: string }) => u.migration);

    // Realtime, cron, buckets and bare constraints are invisible here.
    expect(migrations).toEqual(expect.arrayContaining(["0006", "0009", "0012", "0025"]));
  });
});
