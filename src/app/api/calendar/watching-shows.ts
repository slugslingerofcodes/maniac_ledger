import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnilistAiringSchedule } from "@/lib/anilist";
import type { Database } from "@/lib/database.types";
import { getAiringSchedule, type JikanAnime } from "@/lib/jikan";

import type { AiringShow } from "./ics";

export type WatchingShows =
  | { ok: true; shows: AiringShow[] }
  | { ok: false; reason: "database"; message: string }
  | { ok: false; reason: "schedule" };

/**
 * One user's Watching shows that are airing now, each with its JST slot —
 * what both calendar routes (the cookie download and the token feed) turn
 * into an .ics.
 *
 * The `user_id` filter is explicit and, for the feed, it is the *only* thing
 * scoping the read: that route uses the service-role client, which bypasses
 * RLS entirely, so dropping it would serve every user's library. The cookie
 * route needs it too — migration 0015 made public profiles' progress readable
 * to any signed-in user.
 *
 * `includePrivate: false` leaves out 0023's private entries. The download is
 * the owner's own file; a feed URL is readable by anyone who holds it.
 */
export async function loadWatchingShows(
  supabase: SupabaseClient<Database>,
  userId: string,
  { includePrivate }: { includePrivate: boolean },
): Promise<WatchingShows> {
  let query = supabase
    .from("user_progress")
    .select("anime:anime_id (mal_id, title)")
    .eq("user_id", userId)
    .eq("status", "watching");
  if (!includePrivate) query = query.eq("is_private", false);

  const { data: rows, error } = await query;
  if (error) return { ok: false, reason: "database", message: error.message };

  const watching = (rows ?? []).flatMap((row) =>
    row.anime?.mal_id != null
      ? [{ malId: row.anime.mal_id, title: row.anime.title }]
      : [],
  );

  // Nothing to place — don't spend upstream calls to learn that.
  if (watching.length === 0) return { ok: true, shows: [] };

  let schedule: JikanAnime[];
  try {
    schedule = await getAiringSchedule();
  } catch {
    try {
      schedule = await getAnilistAiringSchedule();
    } catch {
      return { ok: false, reason: "schedule" };
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

  return { ok: true, shows };
}
