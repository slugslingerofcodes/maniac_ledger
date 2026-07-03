import type { Metadata } from "next";

import { JstClock } from "@/components/JstClock";
import { ScheduleList, type ScheduleItem } from "@/components/ScheduleList";
import { getSchedules } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Schedule · anime_maniacs",
  description: "Ongoing anime and their daily broadcast schedule (JST).",
};

export default async function SchedulePage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let items: ScheduleItem[];
  try {
    const anime = await getSchedules(3);
    items = anime.map((a) => ({
      malId: a.mal_id,
      title: a.title,
      posterUrl:
        a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
      score: a.score,
      day: a.broadcast?.day ?? null,
      time: a.broadcast?.time ?? null,
    }));
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <JstClock />
        <p className="mt-8 text-center text-sm text-destructive">
          Couldn&apos;t load the airing schedule right now. Please try again
          later.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      {/* Live Japan-time clock, centered above everything. */}
      <JstClock />

      <div className="mt-2 text-center">
        <h1 className="sr-only">Airing schedule</h1>
        <p className="text-sm text-muted-foreground">
          Ongoing anime by broadcast day — times in JST, with a countdown to
          each next episode.
        </p>
      </div>

      <div className="mt-6">
        <ScheduleList items={items} />
      </div>
    </main>
  );
}
