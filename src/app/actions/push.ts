"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Web Push subscription storage (migration 0018). The browser's PushManager
 * subscription is saved per device; the send-airing-notifications Edge
 * Function reads them with the service role and pushes the daily digest.
 */

const SUBSCRIPTION = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(300),
  auth: z.string().min(1).max(100),
});

export type PushActionResult = { ok: true } | { ok: false; error: string };

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<PushActionResult> {
  const parsed = SUBSCRIPTION.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to enable notifications." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, ...parsed.data },
    { onConflict: "endpoint" },
  );
  if (error) {
    return {
      ok: false,
      error: /relation|does not exist|schema cache|could not find the table/i.test(
        error.message,
      )
        ? "Push notifications aren't set up on the server yet (migration 0018)."
        : error.message,
    };
  }
  return { ok: true };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { ok: false, error: "Bad endpoint." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Whether this browser's subscription endpoint is already stored. */
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  return !error && data != null;
}
