import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { buildAiringCalendar, type AiringShow } from "./ics";
import { loadWatchingShows } from "./watching-shows";

/**
 * GET /api/calendar — downloads an .ics file of the signed-in user's Watching
 * list, each show as a weekly recurring event at its JST broadcast slot.
 * Auth-gated by the proxy; re-checked here.
 *
 * This is a one-time download: the file is a snapshot of today's list and
 * slots. The live subscription is `/api/calendar/feed/<token>.ics`, which a
 * calendar app fetches without cookies and so authenticates by a per-user
 * token instead (migration 0028).
 *
 * The library read filters on `user_id` explicitly (see `loadWatchingShows`):
 * migration 0015 made any public profile's progress readable to any signed-in
 * user, so relying on RLS alone would put strangers' Watching shows in "your"
 * calendar.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // On a cold cache this fans out to a dozen serial Jikan pages behind the
  // shared rate-limit queue. Nobody re-downloads their calendar six times a
  // minute, and without a ceiling one account can stall the queue for everyone.
  const verdict = checkRateLimit(`calendar:${user.id}`, 5, 60_000);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Calendar was requested too recently. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      },
    );
  }

  // The owner's own file, so their private entries are in it.
  const result = await loadWatchingShows(supabase, user.id, { includePrivate: true });
  if (!result.ok) {
    return result.reason === "database"
      ? NextResponse.json({ error: result.message }, { status: 500 })
      : NextResponse.json(
          { error: "The airing schedule is unavailable right now." },
          { status: 503 },
        );
  }

  return calendarResponse(result.shows);
}

function calendarResponse(shows: AiringShow[]) {
  return new NextResponse(buildAiringCalendar(shows, new Date()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="anime-maniacs-airing.ics"',
      "Cache-Control": "no-store",
    },
  });
}
