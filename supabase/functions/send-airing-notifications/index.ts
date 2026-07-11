// send-airing-notifications — Supabase Edge Function (Deno runtime).
//
// Daily job: emails each user a digest of the anime on their watchlist that are
// airing today, then marks those reminders sent.
//
//   1. Read notifications where scheduled_date <= today AND notified_at IS NULL
//      (service-role client → bypasses RLS to see every user's rows).
//   2. Group by user_id; resolve each user's email via the Auth admin API.
//   3. Send one Resend digest per user (HTML template w/ poster thumbnails).
//   4. Stamp notified_at = now() on the rows that were successfully sent.
//
// Secrets (Project → Edge Functions → Secrets, or `supabase secrets set`):
//   RESEND_API_KEY    — required
//   RESEND_FROM       — optional, e.g. "anime_maniacs <alerts@yourdomain.com>"
//   VAPID_PUBLIC_KEY  — optional; enables Web Push (with the two below)
//   VAPID_PRIVATE_KEY — optional
//   VAPID_SUBJECT     — optional, e.g. "mailto:alerts@yourdomain.com"
//   APP_URL           — optional, deep-link base (default the Vercel prod URL)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy:  supabase functions deploy send-airing-notifications
// Invoked daily by pg_cron + pg_net (see migration 0009).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "anime_maniacs <onboarding@resend.dev>";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:alerts@example.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://my-app-teal-psi-80.vercel.app";

// Web Push is optional: only active when the VAPID pair is configured.
const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

type NotificationRow = {
  id: string;
  user_id: string;
  mal_id: number;
  anime_title: string;
  poster_url: string | null;
  scheduled_date: string | null;
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

Deno.serve(async (req) => {
  // Only the cron job (which carries the service-role key) may trigger a send,
  // so a logged-in end user can't fan out emails. verify_jwt also gates this,
  // but the explicit check restricts it to the service role specifically.
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  // 1. Due, unsent reminders.
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, user_id, mal_id, anime_title, poster_url, scheduled_date")
    .lte("scheduled_date", today)
    .is("notified_at", null);

  if (error) return json({ error: error.message }, 500);
  if (!rows || rows.length === 0) {
    return json({ usersEmailed: 0, rowsMarked: 0, message: "nothing due" }, 200);
  }

  // 2. Group by user.
  const byUser = new Map<string, NotificationRow[]>();
  for (const r of rows as NotificationRow[]) {
    (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(r);
  }

  let usersEmailed = 0;
  let rowsMarked = 0;
  const failures: string[] = [];

  // 3. One digest per user.
  for (const [userId, items] of byUser) {
    const { data: userRes, error: userErr } =
      await supabase.auth.admin.getUserById(userId);
    const email = userRes?.user?.email;
    if (userErr || !email) {
      failures.push(`no email for user ${userId}`);
      continue;
    }

    try {
      await sendDigest(email, items);
    } catch (e) {
      // Leave notified_at null so the next daily run retries this user.
      failures.push(`send failed for ${userId}: ${asMessage(e)}`);
      continue;
    }

    // Best-effort Web Push to each of the user's devices (never blocks the
    // email path or the notified_at stamp).
    if (pushEnabled) {
      try {
        await sendWebPush(supabase, userId, items);
      } catch (e) {
        failures.push(`push failed for ${userId}: ${asMessage(e)}`);
      }
    }

    // 4. Mark this user's rows sent (only after a successful send).
    const ids = items.map((i) => i.id);
    const { error: updErr } = await supabase
      .from("notifications")
      .update({ notified_at: new Date().toISOString() })
      .in("id", ids);
    if (updErr) {
      failures.push(`mark failed for ${userId}: ${updErr.message}`);
      continue;
    }

    usersEmailed++;
    rowsMarked += ids.length;
  }

  return json({ usersEmailed, rowsMarked, failures }, 200);
});

function asMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

type ServiceClient = ReturnType<typeof createClient>;

/**
 * Pushes the digest to every subscription the user has (migration 0018).
 * Dead subscriptions (404/410 from the push service) are deleted so the
 * table self-heals as browsers expire endpoints.
 */
async function sendWebPush(
  supabase: ServiceClient,
  userId: string,
  items: NotificationRow[],
) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const payload = JSON.stringify({
    title:
      items.length === 1
        ? `${items[0].anime_title} airs today`
        : `${items.length} anime air today`,
    body:
      items.length === 1
        ? "New episode day — tap to open your library."
        : items.map((i) => i.anime_title).slice(0, 3).join(" · "),
    url: `${APP_URL}/library`,
    icon: items[0].poster_url ?? undefined,
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
        },
        payload,
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint as string);
      }
    }
  }
}

async function sendDigest(to: string, items: NotificationRow[]) {
  const subject =
    items.length === 1
      ? `${items[0].anime_title} airs today`
      : `${items.length} anime on your watchlist air today`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      html: renderDigest(items),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

function renderDigest(items: NotificationRow[]): string {
  const cards = items
    .map((i) => {
      const title = escapeHtml(i.anime_title);
      const poster = i.poster_url
        ? `<img src="${escapeHtml(i.poster_url)}" alt="" width="60" height="90"
             style="width:60px;height:90px;object-fit:cover;border-radius:6px;display:block;" />`
        : `<div style="width:60px;height:90px;border-radius:6px;background:#27272a;"></div>`;
      return `
        <tr>
          <td style="padding:8px 12px 8px 0;vertical-align:top;">${poster}</td>
          <td style="padding:8px 0;vertical-align:middle;font-size:15px;color:#fafafa;">
            <strong>${title}</strong><br />
            <span style="font-size:13px;color:#a1a1aa;">Airing today</span>
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#09090b;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="width:480px;max-width:90%;background:#18181b;border-radius:12px;padding:24px;">
            <tr>
              <td style="font-size:18px;font-weight:700;color:#fafafa;padding-bottom:4px;">anime_maniacs</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#a1a1aa;padding-bottom:16px;">
                Airing today on your watchlist:
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#71717a;padding-top:20px;border-top:1px solid #27272a;">
                You're getting this because you tapped “Notify me when it airs.”
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
