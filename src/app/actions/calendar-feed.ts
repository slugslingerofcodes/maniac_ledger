"use server";

import { feedPath, generateFeedToken, hashFeedToken } from "@/lib/calendar-feed";
import { createClient } from "@/lib/supabase/server";

/**
 * The calendar subscription link: mint or rotate it, turn it off, and ask
 * whether one is on. The feed itself is `/api/calendar/feed/<token>.ics`.
 *
 * These run on the signed-in client, so RLS (owner-only, migration 0028)
 * applies — and every query still filters on `user_id` explicitly, the rule
 * this codebase keeps since 0015 showed what an RLS-only scope can turn into.
 * Each action checks the session itself: action IDs can be POSTed from any
 * route, including public ones.
 */

const SIGNED_OUT = "You must be signed in.";

export type CalendarFeedStatus = {
  /** False when the feed can't work here: signed out, no service-role key, or 0028 not applied. */
  available: boolean;
  active: boolean;
};

export async function getCalendarFeedStatus(): Promise<CalendarFeedStatus> {
  const off = { available: false, active: false };

  // The feed route resolves tokens with the service role. Without the key it
  // 503s every request, so handing out a link would only hand out an error.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return off;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return off;

  const { data, error } = await supabase
    .from("calendar_feeds")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  // Most likely migration 0028 hasn't been applied — hide the control rather
  // than offer one that fails.
  if (error) return off;

  return { available: true, active: data != null };
}

/**
 * Creates the user's subscription link, or replaces it — the new token
 * overwrites the old hash, so the previous link stops working at once. The
 * token is returned exactly once, inside the path; only its hash is stored.
 */
export async function rotateCalendarFeed(): Promise<
  { ok: true; path: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const token = generateFeedToken();
  const { error } = await supabase.from("calendar_feeds").upsert(
    {
      user_id: user.id,
      token_hash: hashFeedToken(token),
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[calendar-feed] rotate failed:", error.message);
    return { ok: false, error: "Couldn't create a calendar link. Try again later." };
  }

  return { ok: true, path: feedPath(token) };
}

/** Turns the link off. Calendars subscribed to it keep their last copy and stop updating. */
export async function revokeCalendarFeed(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.from("calendar_feeds").delete().eq("user_id", user.id);
  if (error) {
    console.error("[calendar-feed] revoke failed:", error.message);
    return { ok: false, error: "Couldn't turn off the calendar link. Try again later." };
  }

  return { ok: true };
}
