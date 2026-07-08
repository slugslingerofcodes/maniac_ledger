import type { Metadata } from "next";

import { UpcomingCard } from "@/components/anime/UpcomingCard";
import { getUpcomingSeasons, type JikanAnime, type JikanSeason } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Upcoming · anime_maniacs",
  description: "Anime coming next season — get a reminder when they air.",
};

/* -------------------------------------------------------------------------- */
/* Seasonal grouping                                                          */
/* -------------------------------------------------------------------------- */

const SEASON_ORDER: Record<JikanSeason, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
};
const SEASON_LABEL: Record<JikanSeason, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** Derive an anime season from an ISO air date (the standard 3-month buckets). */
function seasonFromDate(iso: string): { season: JikanSeason; year: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getUTCMonth(); // 0 = Jan … 11 = Dec
  const season: JikanSeason =
    m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
  return { season, year: d.getUTCFullYear() };
}

/** Prefer Jikan's own season/year; fall back to the air date; else unknown. */
function seasonOf(a: JikanAnime): { season: JikanSeason; year: number } | null {
  if (a.season && a.year) return { season: a.season, year: a.year };
  if (a.aired?.from) return seasonFromDate(a.aired.from);
  return null;
}

type SeasonGroup = { label: string; sortKey: number; items: JikanAnime[] };

/** Bucket anime by "Season Year", chronological, with TBA titles last. */
function groupBySeason(anime: JikanAnime[]): SeasonGroup[] {
  const groups = new Map<string, SeasonGroup>();
  for (const a of anime) {
    const s = seasonOf(a);
    const label = s ? `${SEASON_LABEL[s.season]} ${s.year}` : "To Be Announced";
    // year * 4 + season index keeps a strict chronological order; TBA sinks last.
    const sortKey = s ? s.year * 4 + SEASON_ORDER[s.season] : Number.MAX_SAFE_INTEGER;
    const existing = groups.get(label);
    if (existing) existing.items.push(a);
    else groups.set(label, { label, sortKey, items: [a] });
  }
  return [...groups.values()].sort((x, y) => x.sortKey - y.sortKey);
}

/* -------------------------------------------------------------------------- */

export default async function UpcomingPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let upcoming: JikanAnime[];
  try {
    upcoming = await getUpcomingSeasons(2);
  } catch {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Header />
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load upcoming anime right now. Please try again later.
        </p>
      </main>
    );
  }

  // Which of these the user already has a reminder for (RLS-scoped to them).
  const supabase = await createClient();
  const { data: reminders } = await supabase
    .from("notifications")
    .select("mal_id");
  const notifyingIds = new Set((reminders ?? []).map((r) => r.mal_id));

  const groups = groupBySeason(upcoming);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Header />

      {groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No upcoming anime to show right now.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {group.label}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "title" : "titles"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((a) => (
                  <UpcomingCard
                    key={a.mal_id}
                    initialNotifying={notifyingIds.has(a.mal_id)}
                    item={{
                      malId: a.mal_id,
                      title: a.title,
                      posterUrl:
                        a.images?.jpg?.large_image_url ??
                        a.images?.jpg?.image_url ??
                        null,
                      broadcastDay: a.broadcast?.day ?? null,
                      studio: a.studios?.[0]?.name ?? null,
                      // Jikan `aired.from` is an ISO datetime; our column is a date.
                      scheduledDate: a.aired?.from ? a.aired.from.slice(0, 10) : null,
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-gradient text-2xl font-semibold tracking-tight">Upcoming Anime</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Grouped by season. Tap the bell to be reminded when one airs.
      </p>
    </div>
  );
}
