// weekly-digest — Supabase Edge Function (Deno runtime).
//
// Monday job (migration 0019): one email per active user with
//   1. "Airing from your library" — entries they track that are currently
//      airing (status watching / plan_to_watch).
//   2. "Picks for you" — three top-rated catalog titles they don't track yet.
//
// Users with nothing airing AND an empty library are skipped — no spam.
//
// Secrets: RESEND_API_KEY (required), RESEND_FROM, APP_URL (optional).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy:  supabase functions deploy weekly-digest

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM =
  Deno.env.get("RESEND_FROM") ?? "anime_maniacs <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://my-app-teal-psi-80.vercel.app";

type AiringItem = {
  title: string;
  poster_url: string | null;
  episodes_watched: number;
  total_episodes: number | null;
};

type Pick = { title: string; poster_url: string | null; score: number | null };

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

function asMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Everything users track on currently-airing shows (service role → all users).
  const { data: rows, error } = await supabase
    .from("user_progress")
    .select(
      "user_id, status, episodes_watched, anime:anime_id (id, title, poster_url, status, total_episodes, score)",
    )
    .in("status", ["watching", "plan_to_watch"]);
  if (error) return json({ error: error.message }, 500);

  type Row = {
    user_id: string;
    episodes_watched: number;
    anime: {
      id: string;
      title: string;
      poster_url: string | null;
      status: string;
      total_episodes: number | null;
    } | null;
  };

  const byUser = new Map<string, { airing: AiringItem[]; animeIds: Set<string> }>();
  for (const r of (rows ?? []) as Row[]) {
    if (!r.anime) continue;
    const bucket =
      byUser.get(r.user_id) ??
      byUser.set(r.user_id, { airing: [], animeIds: new Set() }).get(r.user_id)!;
    bucket.animeIds.add(r.anime.id);
    if (r.anime.status === "currently_airing") {
      bucket.airing.push({
        title: r.anime.title,
        poster_url: r.anime.poster_url,
        episodes_watched: r.episodes_watched,
        total_episodes: r.anime.total_episodes,
      });
    }
  }

  // A shared pool of well-rated catalog titles for the picks section. Hentai
  // rows are excluded — the shared catalog also holds titles added from the
  // adult "miscellaneous" tab, and picks land in every user's inbox.
  const { data: pool } = await supabase
    .from("anime")
    .select("id, title, poster_url, score")
    .not("score", "is", null)
    .not("genres", "cs", "{Hentai}")
    .order("score", { ascending: false })
    .limit(60);

  let usersEmailed = 0;
  const failures: string[] = [];

  for (const [userId, bucket] of byUser) {
    if (bucket.airing.length === 0) continue; // nothing to say this week

    const { data: userRes, error: userErr } =
      await supabase.auth.admin.getUserById(userId);
    const email = userRes?.user?.email;
    if (userErr || !email) {
      failures.push(`no email for ${userId}`);
      continue;
    }

    const picks: Pick[] = (pool ?? [])
      .filter((p) => !bucket.animeIds.has(p.id))
      .slice(0, 3)
      .map((p) => ({ title: p.title, poster_url: p.poster_url, score: p.score }));

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: email,
          subject: `Your week in anime — ${bucket.airing.length} airing from your list`,
          html: renderDigest(bucket.airing, picks),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      usersEmailed++;
    } catch (e) {
      failures.push(`send failed for ${userId}: ${asMessage(e)}`);
    }
  }

  return json({ usersEmailed, failures }, 200);
});

function card(title: string, poster: string | null, meta: string): string {
  const img = poster
    ? `<img src="${escapeHtml(poster)}" alt="" width="48" height="72"
         style="width:48px;height:72px;object-fit:cover;border-radius:6px;display:block;" />`
    : `<div style="width:48px;height:72px;border-radius:6px;background:#27272a;"></div>`;
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;vertical-align:top;">${img}</td>
      <td style="padding:6px 0;vertical-align:middle;font-size:14px;color:#fafafa;">
        <strong>${escapeHtml(title)}</strong><br />
        <span style="font-size:12px;color:#a1a1aa;">${escapeHtml(meta)}</span>
      </td>
    </tr>`;
}

function renderDigest(airing: AiringItem[], picks: Pick[]): string {
  const airingRows = airing
    .slice(0, 8)
    .map((a) =>
      card(
        a.title,
        a.poster_url,
        a.total_episodes != null
          ? `You're at ${a.episodes_watched}/${a.total_episodes} episodes`
          : `You're at episode ${a.episodes_watched}`,
      ),
    )
    .join("");
  const pickRows = picks
    .map((p) => card(p.title, p.poster_url, p.score != null ? `★ ${p.score}` : ""))
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#09090b;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="width:480px;max-width:90%;background:#18181b;border-radius:12px;padding:24px;">
            <tr><td style="font-size:18px;font-weight:700;color:#fafafa;padding-bottom:4px;">anime_maniacs</td></tr>
            <tr><td style="font-size:14px;color:#a1a1aa;padding-bottom:16px;">Your week in anime</td></tr>
            <tr><td style="font-size:13px;font-weight:700;color:#fafafa;padding-bottom:6px;">AIRING FROM YOUR LIBRARY</td></tr>
            <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${airingRows}</table></td></tr>
            ${
              pickRows
                ? `<tr><td style="font-size:13px;font-weight:700;color:#fafafa;padding:16px 0 6px;">PICKS FOR YOU</td></tr>
                   <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pickRows}</table></td></tr>`
                : ""
            }
            <tr>
              <td style="font-size:12px;color:#71717a;padding-top:20px;border-top:1px solid #27272a;">
                <a href="${APP_URL}/library" style="color:#a1a1aa;">Open your library</a> — sent weekly while you have airing shows.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
