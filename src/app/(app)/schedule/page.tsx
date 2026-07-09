import type { Metadata } from "next";

import { ScheduleClocks } from "@/components/ScheduleClocks";
import { ScheduleList, type ScheduleItem } from "@/components/ScheduleList";
import { getAiringSchedule } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Schedule · anime_maniacs",
  description: "Ongoing anime and their daily broadcast schedule (JST / IST).",
};

export default async function SchedulePage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let items: ScheduleItem[];
  try {
    const anime = await getAiringSchedule();
    items = anime.map((a) => ({
      malId: a.mal_id,
      title: a.title,
      posterUrl:
        a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
      score: a.score,
      type: a.type ?? null,
      day: a.broadcast?.day ?? null,
      time: a.broadcast?.time ?? null,
    }));
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <ScheduleClocks />
        <p className="mt-8 text-center text-sm text-destructive">
          Couldn&apos;t load the airing schedule right now. Please try again
          later.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="sr-only">Airing schedule</h1>
      {/* Live Japan + India clocks, centered above the board. */}
      <ScheduleClocks />

      <div className="mt-6">
        <ScheduleList items={items} />
      </div>
    </main>
  );
}
