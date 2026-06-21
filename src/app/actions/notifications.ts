"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ToggleNotifyInput = {
  malId: number;
  animeTitle: string;
  /** Poster URL, denormalized so the daily digest email needs no lookup. */
  posterUrl: string | null;
  /** ISO date (YYYY-MM-DD) the anime is scheduled to air, or null if unknown. */
  scheduledDate: string | null;
};

export type ToggleNotifyResult =
  | { ok: true; notifying: boolean }
  | { ok: false; error: string };

/**
 * Toggles an air-date reminder for an upcoming anime. Inserts a `notifications`
 * row if the user isn't already subscribed, deletes it if they are.
 *
 * The signature carries `animeTitle`/`scheduledDate` (not just `malId`) because
 * the insert denormalizes them — the client already has these from the rendered
 * card, which avoids an extra rate-limited Jikan round-trip per toggle. RLS
 * scopes every row to the current user; `user_id` is set explicitly on insert.
 */
export async function toggleNotify(
  input: ToggleNotifyInput,
): Promise<ToggleNotifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to set reminders." };
  }

  // RLS already scopes this to the current user, so filtering by mal_id alone
  // finds their existing reminder (if any).
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("mal_id", input.malId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/upcoming");
    return { ok: true, notifying: false };
  }

  const { error } = await supabase.from("notifications").insert({
    user_id: user.id,
    mal_id: input.malId,
    anime_title: input.animeTitle,
    poster_url: input.posterUrl,
    scheduled_date: input.scheduledDate,
    notified_at: null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/upcoming");
  return { ok: true, notifying: true };
}
