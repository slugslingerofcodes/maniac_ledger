import type { Metadata } from "next";

import { ScheduleClocks } from "@/components/ScheduleClocks";
import { ScheduleList, type ScheduleItem } from "@/components/ScheduleList";
import { SourceNotice } from "@/components/SourceNotice";
import { getAnilistAiringSchedule } from "@/lib/anilist";
import { getAiringSchedule, type JikanAnime } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Schedule · anime_maniacs",
  description: "Ongoing anime and their daily broadcast schedule (JST / IST).",
};

export default async function SchedulePage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  // MAL (Jikan) primary; AniList fallback derives each show's JST slot from
  // its next airing episode, so the board keeps working through MAL outages.
  let anime: JikanAnime[];
  let source: "mal" | "anilist" = "mal";
  try {
    anime = await getAiringSchedule();
  } catch {
    try {
      anime = await getAnilistAiringSchedule();
      source = "anilist";
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
  }

  const items: ScheduleItem[] = anime.map((a) => ({
    malId: a.mal_id,
    title: a.title,
    posterUrl:
      a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
    score: a.score,
    type: a.type ?? null,
    day: a.broadcast?.day ?? null,
    time: a.broadcast?.time ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="sr-only">Airing schedule</h1>
      {/* Live Japan + India clocks, centered above the board. */}
      <ScheduleClocks />

      <div className="mt-6">
        <SourceNotice source={source} anilistLabel="Schedule via AniList" />
        <ScheduleList items={items} />
      </div>
    </main>
  );
}
