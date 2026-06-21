import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

/** Shape returned by the `resolve-franchise` Edge Function. */
const FranchiseResultSchema = z.object({
  rootMalId: z.number().int().positive(),
  malIds: z.array(z.number().int()).min(1),
  depthReached: z.number().int(),
  truncated: z.boolean(),
});

/**
 * Resolves an anime's franchise (via the `resolve-franchise` Edge Function) and
 * stamps a shared `franchise_id` onto every sibling that exists in our catalog:
 *
 *  - If any sibling already carries a `franchise_id`, that one is reused (so the
 *    group converges as more members are added over time).
 *  - Otherwise a fresh UUID is minted and applied to the whole group.
 *
 * Best-effort by contract: it resolves to `void` and swallows nothing itself —
 * callers run it via `after()` wrapped in try/catch so a Jikan hiccup never
 * affects the add. Only members already present in `anime` are updated; ones not
 * yet in the catalog inherit the id when they're later added (the reuse rule).
 */
export async function resolveAndAssignFranchise(
  supabase: DB,
  malId: number,
): Promise<void> {
  // 1. Ask the Edge Function for every member's MAL id.
  const { data, error } = await supabase.functions.invoke("resolve-franchise", {
    body: { malId },
  });
  if (error) throw error;

  const parsed = FranchiseResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("resolve-franchise returned an unexpected shape");
  }
  const { malIds } = parsed.data;

  // 2. Which of those siblings do we actually have in the catalog?
  const { data: siblings, error: selErr } = await supabase
    .from("anime")
    .select("id, mal_id, franchise_id")
    .in("mal_id", malIds);
  if (selErr) throw selErr;
  if (!siblings || siblings.length === 0) return;

  // 3. Reuse an existing franchise_id if one is already set, else mint a new one.
  const existing = siblings.find((s) => s.franchise_id != null)?.franchise_id;
  const franchiseId = existing ?? crypto.randomUUID();

  // 4. Stamp it onto every sibling that doesn't already have exactly this id.
  const toUpdate = siblings
    .filter((s) => s.franchise_id !== franchiseId)
    .map((s) => s.id);
  if (toUpdate.length === 0) return;

  const { error: updErr } = await supabase
    .from("anime")
    .update({ franchise_id: franchiseId })
    .in("id", toUpdate);
  if (updErr) throw updErr;
}
