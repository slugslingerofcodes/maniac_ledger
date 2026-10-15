import { NextResponse } from "next/server";

import { getAnilistAiringSchedule } from "@/lib/anilist";
import { getAiringSchedule, type JikanAnime } from "@/lib/jikan";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { buildAiringCalendar, type AiringShow } from "./ics";

/**
 * GET /api/calendar — downloads an .ics file of the signed-in user's Watching
 * list, each show as a weekly recurring event at its JST broadcast slot.
 * Auth-gated by the proxy; re-checked here.
 *
 * This is a one-time download, not a live subscription: the file is a snapshot
 * of today's list and slots. A subscription URL would be fetched by the
 * calendar app without the user's cookies, so it would need a per-user token —
 * and a migration to store it.
 *
 * The library query filters on `user_id` explicitly: migration 0015 made any
 * public profile's progress readable to any signed-in user, so relying on RLS
 * alone would put strangers' Watching shows in "your" calendar.
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

  const { data: rows, error } = await supabase
    .from("user_progress")
    .select("anime:anime_id (mal_id, title)")
    .eq("user_id", user.id)
    .eq("status", "watching");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const watching = (rows ?? []).flatMap((row) =>
    row.anime?.mal_id != null
      ? [{ malId: row.anime.mal_id, title: row.anime.title }]
      : [],
  );

  // Nothing to place — don't spend upstream calls to learn that.
  if (watching.length === 0) {
    return calendarResponse([]);
  }

  let schedule: JikanAnime[];
  try {
    schedule = await getAiringSchedule();
  } catch {
    try {
      schedule = await getAnilistAiringSchedule();
    } catch {
      return NextResponse.json(
        { error: "The airing schedule is unavailable right now." },
        { status: 503 },
      );
    }
  }

  const slots = new Map<number, JikanAnime["broadcast"]>();
  for (const anime of schedule) {
    if (!slots.has(anime.mal_id)) slots.set(anime.mal_id, anime.broadcast);
  }

  // Title comes from the library row (what the user sees in their list); only
  // the slot comes from upstream. Shows not currently airing have no slot and
  // are dropped; buildAiringCalendar drops slots it can't parse.
  const shows: AiringShow[] = watching.flatMap(({ malId, title }) => {
    const broadcast = slots.get(malId);
    return broadcast?.day && broadcast.time
      ? [{ malId, title, day: broadcast.day, time: broadcast.time }]
      : [];
  });

  return calendarResponse(shows);
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
