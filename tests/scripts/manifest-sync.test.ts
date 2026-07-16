import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MANIFEST } from "../../scripts/check-schema.mjs";

/**
 * Schema work in this repo is three hand-maintained artifacts: the migration,
 * `database.types.ts`, and the check-schema manifest. Nothing used to notice
 * when someone updated one and forgot another — this test makes that a red
 * build instead of a silent gap: every table the types declare must be probed
 * by the manifest (and vice versa, so deletions propagate too).
 */

/** Table names declared in database.types.ts, parsed from the Tables block. */
function typesTables(): Set<string> {
  const source = readFileSync(
    join(__dirname, "../../src/lib/database.types.ts"),
    "utf8",
  );
  const tablesBlock = /Tables:\s*\{([\s\S]*?)\n {4}\};/.exec(source)?.[1];
  if (!tablesBlock) throw new Error("could not locate the Tables block");
  // Table entries sit at 6-space indentation: `      anime: {`.
  return new Set(
    [...tablesBlock.matchAll(/^ {6}(\w+): \{/gm)].map((m) => m[1]),
  );
}

const manifestTables = new Set(
  (MANIFEST as { table: string }[]).map((m) => m.table),
);

describe("types ↔ manifest sync", () => {
  it("parses a plausible number of tables from database.types.ts", () => {
    // Guard the parser itself: if the regex rots, this fails loudly instead
    // of the set comparisons passing on two empty sets.
    expect(typesTables().size).toBeGreaterThan(10);
  });

  it("probes every table the types declare", () => {
    const missing = [...typesTables()].filter((t) => !manifestTables.has(t));

    expect(
      missing,
      `tables in database.types.ts but not probed by scripts/check-schema.mjs — add them to MANIFEST: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("declares types for every table it probes", () => {
    const types = typesTables();
    const extra = [...manifestTables].filter((t) => !types.has(t));

    expect(
      extra,
      `tables probed by check-schema but absent from database.types.ts — stale manifest entries or missing types: ${extra.join(", ")}`,
    ).toEqual([]);
  });
});
