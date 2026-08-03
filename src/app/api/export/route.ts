import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/export — downloads the signed-in user's full tracking data as JSON
 * (library entries + per-episode watch log). Auth-gated by the middleware;
 * re-checked here.
 *
 * The library query filters on `user_id` explicitly: migration 0015 made any
 * public profile's progress readable to any signed-in user, so relying on RLS
 * alone would export strangers' rows inside "your" data file.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This reads up to 50,000 episode rows per call. Nobody exports their library
  // six times a minute, and without a ceiling it is a one-line way for an
  // authenticated account to hammer the database.
  const verdict = checkRateLimit(`export:${user.id}`, 5, 60_000);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Export was requested too recently. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      },
    );
  }

  const [{ data: library, error: libErr }, { data: episodes, error: epErr }] =
    await Promise.all([
      supabase
        .from("user_progress")
        .select(
          "status, score, episodes_watched, notes, started_at, completed_at, last_watched_at, updated_at, anime:anime_id (mal_id, title, title_english, type, total_episodes)",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("episode_progress")
        .select("watched_at, episode:episode_id (number, anime:anime_id (mal_id, title))")
        .order("watched_at", { ascending: true })
        .limit(50_000),
    ]);

  if (libErr || epErr) {
    return NextResponse.json(
      { error: libErr?.message ?? epErr?.message },
      { status: 500 },
    );
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    source: "anime_maniacs",
    library: (library ?? []).map((row) => ({
      malId: row.anime?.mal_id ?? null,
      title: row.anime?.title ?? null,
      titleEnglish: row.anime?.title_english ?? null,
      type: row.anime?.type ?? null,
      totalEpisodes: row.anime?.total_episodes ?? null,
      status: row.status,
      score: row.score,
      episodesWatched: row.episodes_watched,
      notes: row.notes,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastWatchedAt: row.last_watched_at,
      updatedAt: row.updated_at,
    })),
    episodeLog: (episodes ?? []).map((row) => ({
      malId: row.episode?.anime?.mal_id ?? null,
      animeTitle: row.episode?.anime?.title ?? null,
      episode: row.episode?.number ?? null,
      watchedAt: row.watched_at,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="anime-maniacs-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
