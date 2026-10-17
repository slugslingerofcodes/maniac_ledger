import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MANIFEST } from "../../scripts/check-schema.mjs";

/**
 * Migration 0028 holds the credential for every calendar feed, and there is no
 * migration runner to review it on the way in — it gets pasted into the SQL
 * editor. These are the properties that make a database read of it harmless,
 * checked against the SQL text itself.
 */

const sql = readFileSync(
  join(__dirname, "../../supabase/migrations/0028_calendar_feeds.sql"),
  "utf8",
)
  // Comments explain the design and mention words like "anon"; only the
  // statements count.
  .replace(/--.*$/gm, "");

const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);

describe("0028_calendar_feeds.sql", () => {
  it("turns row level security on", () => {
    expect(sql).toMatch(/alter table public\.calendar_feeds\s+enable row level security/i);
  });

  it("stores a unique, non-null token hash and no raw token column", () => {
    expect(sql).toMatch(/token_hash\s+text\s+not null\s+unique/i);
    expect(sql).not.toMatch(/^\s*token\s+text/im);
  });

  it("allows one feed per user", () => {
    expect(sql).toMatch(/user_id\s+uuid\s+primary key\s+references auth\.users/i);
  });

  it("scopes every policy to the row's owner, for signed-in users only", () => {
    expect(policies.length).toBeGreaterThanOrEqual(4);
    for (const policy of policies) {
      expect(policy).toMatch(/to authenticated/i);
      expect(policy).toMatch(/user_id = auth\.uid\(\)/i);
      expect(policy).not.toMatch(/\banon\b|\bpublic\b(?!\.)/i);
    }
  });

  it("is probed by check-schema", () => {
    expect(MANIFEST).toContainEqual(
      expect.objectContaining({ migration: "0028", table: "calendar_feeds" }),
    );
  });
});
