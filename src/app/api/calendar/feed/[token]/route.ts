import { NextResponse } from "next/server";

import { hashFeedToken, parseFeedToken } from "@/lib/calendar-feed";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import { buildAiringCalendar } from "../../ics";
import { loadWatchingShows } from "../../watching-shows";

/**
 * GET /api/calendar/feed/<token>.ics — the live subscription version of
 * "Add to calendar". A calendar app (Google, Apple, Outlook) fetches this on
 * its own schedule, with no cookies, so:
 *
 *  - the path is public (`PUBLIC_PATHS` in src/lib/supabase/middleware.ts) and
 *    the token is the only credential;
 *  - token → user is resolved with the service-role client, by the token's
 *    SHA-256 (all that migration 0028 stores);
 *  - every read after that bypasses RLS, so the explicit `user_id` filter in
 *    `loadWatchingShows` is the whole scoping boundary, and private entries
 *    are left out — anyone holding the URL can read it.
 *
 * Unknown, revoked and malformed tokens all get the same 404, so the response
 * says nothing about which tokens exist. Error bodies are generic: this route
 * is reachable by anyone, and database messages name tables and policies.
 */

/**
 * Per token. Calendar apps poll every 5 minutes at the most aggressive
 * (Apple's lowest setting) and every several hours typically, so 10 per 10
 * minutes leaves room for a few devices sharing one link while capping what a
 * leaked URL can cost — each miss on a cold cache is a dozen serial Jikan
 * pages behind the queue every user shares.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;

/** Hint to calendar apps; most poll on their own clock regardless. */
const REFRESH_HOURS = 6;

const NOT_FOUND = "Calendar feed not found.";
const UNAVAILABLE = "Calendar feed is unavailable right now.";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const token = parseFeedToken((await params).token);
  if (!token) return json({ error: NOT_FOUND }, 404);

  const tokenHash = hashFeedToken(token);

  // Before any I/O, and keyed on the hash so the limiter's long-lived map never
  // holds a working token. Only someone holding a token can spend its budget,
  // and a 256-bit token can't be guessed into someone else's.
  const verdict = checkRateLimit(`calendar-feed:${tokenHash}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!verdict.ok) {
    return json(
      { error: "Calendar feed was requested too often. Try again later." },
      429,
      { "Retry-After": String(verdict.retryAfterSeconds) },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[calendar-feed] service-role client unavailable:", err);
    return json({ error: UNAVAILABLE }, 503);
  }

  const { data: feed, error: lookupError } = await admin
    .from("calendar_feeds")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (lookupError) {
    console.error("[calendar-feed] token lookup failed:", lookupError.message);
    return json({ error: UNAVAILABLE }, 500);
  }
  if (!feed) return json({ error: NOT_FOUND }, 404);

  const result = await loadWatchingShows(admin, feed.user_id, { includePrivate: false });
  if (!result.ok) {
    if (result.reason === "schedule") {
      return json({ error: "The airing schedule is unavailable right now." }, 503);
    }
    console.error("[calendar-feed] library read failed:", result.message);
    return json({ error: UNAVAILABLE }, 500);
  }

  return new NextResponse(
    buildAiringCalendar(result.shows, new Date(), { refreshHours: REFRESH_HOURS }),
    {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="anime-maniacs-airing.ics"',
        // Per-user data behind a bearer URL: no shared cache may keep a copy.
        ...NO_STORE,
      },
    },
  );
}

function json(body: { error: string }, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}
