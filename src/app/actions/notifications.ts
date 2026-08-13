"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ReminderItem = {
  id: string;
  malId: number;
  title: string;
  posterUrl: string | null;
  /** ISO date (YYYY-MM-DD), or null when the air date was unknown. */
  scheduledDate: string | null;
  /** Set once the digest job has emailed/pushed this one. */
  notifiedAt: string | null;
  /** True when the air date has arrived or passed — the actionable ones. */
  due: boolean;
  createdAt: string;
};

/**
 * The signed-in user's air-date reminders, most imminent first, for the
 * notification inbox. Until now `notifications` rows were write-only from the
 * app's point of view: you could set a reminder, and it could reach you by
 * email or push, but there was nowhere in the product to see what you'd asked
 * for or to catch up on one you'd missed.
 *
 * RLS scopes the table to `auth.uid()`, so no user filter is needed here.
 */
export async function getReminders(): Promise<ReminderItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id, mal_id, anime_title, poster_url, scheduled_date, notified_at, created_at")
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .limit(100);
  if (error || !data) return [];

  const today = new Date().toISOString().slice(0, 10);
  return data.map((row) => ({
    id: row.id,
    malId: row.mal_id,
    title: row.anime_title,
    posterUrl: row.poster_url,
    scheduledDate: row.scheduled_date,
    notifiedAt: row.notified_at,
    // A null date can never be "due" — we don't know when it airs, so
    // announcing it as ready would be a lie.
    due: row.scheduled_date != null && row.scheduled_date <= today,
    createdAt: row.created_at,
  }));
}

/** Drops a reminder from the inbox (same row the bell counts). */
export async function dismissReminder(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}

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
