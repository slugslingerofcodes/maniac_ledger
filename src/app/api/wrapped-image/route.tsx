import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getYearStats } from "@/lib/user-stats";

/**
 * GET /api/wrapped-image?year=2026 — the Anime Wrapped share card, rendered
 * server-side with next/og so the preview, download, and share sheet are the
 * same pixels. Auth-gated (the middleware redirects signed-out requests, and
 * we re-check here). Never cached: stats move as the user watches.
 */

const SIZE = 1080;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const yearParam = Number(request.nextUrl.searchParams.get("year"));
  const now = new Date().getFullYear();
  const year =
    Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= now
      ? yearParam
      : now;

  let stats;
  try {
    stats = await getYearStats(year);
  } catch {
    return new Response("Failed to compute stats", { status: 500 });
  }

  const topGenres = stats.topGenres.slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(160deg, #09090b 0%, #18181b 55%, #27272a 100%)",
          color: "#fafafa",
          fontSize: 28,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              letterSpacing: 6,
              color: "#a1a1aa",
            }}
          >
            ANIME WRAPPED
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 120,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {String(year)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 48 }}>
          <Big label="episodes" value={stats.episodesWatched} />
          <Big label="hours" value={stats.hoursWatched} />
          <Big label="anime" value={stats.animeTouched} />
          <Big label="completed" value={stats.completed} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {topGenres.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa" }}>
                Top genres
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                {topGenres.map((g) => (
                  <div
                    key={g.name}
                    style={{
                      display: "flex",
                      padding: "10px 26px",
                      borderRadius: 999,
                      background: "#3f3f46",
                      fontSize: 30,
                    }}
                  >
                    {g.name}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {stats.topRated ? (
            <div style={{ display: "flex", fontSize: 28, color: "#d4d4d8" }}>
              {`Favorite: ${stats.topRated.title} (★${stats.topRated.score})`}
            </div>
          ) : null}
          {stats.longestStreak > 1 ? (
            <div style={{ display: "flex", fontSize: 28, color: "#d4d4d8" }}>
              {`Longest streak: ${stats.longestStreak} days straight`}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #3f3f46",
              paddingTop: 24,
              fontSize: 24,
              color: "#a1a1aa",
            }}
          >
            <span>anime_maniacs</span>
            <span>my year in anime</span>
          </div>
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function Big({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>
        {value.toLocaleString("en-US")}
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa" }}>
        {label}
      </div>
    </div>
  );
}
