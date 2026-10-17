import { Suspense } from "react";
import type { Metadata } from "next";

import { getCalendarFeedStatus } from "@/app/actions/calendar-feed";
import { ScheduleClocks } from "@/components/ScheduleClocks";
import { ScheduleList, type ScheduleItem } from "@/components/ScheduleList";
import { AddToCalendarButton } from "@/components/schedule/AddToCalendarButton";
import { CalendarSubscription } from "@/components/schedule/CalendarSubscription";
import { SourceNotice } from "@/components/SourceNotice";
import { getAnilistAiringSchedule } from "@/lib/anilist";
import { getAiringSchedule, type JikanAnime } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";

import { ScheduleBoardSkeleton } from "./schedule-skeleton";

export const metadata: Metadata = {
  title: "Schedule · anime_maniacs",
  description: "Ongoing anime and their daily broadcast schedule (JST / IST).",
};

export default async function SchedulePage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  // Only the board waits on the upstream schedule. The clocks, the calendar
  // export and the subscription control are ours, so they paint at once rather
  // than sitting behind a Jikan round trip (1–3s when slow, a timeout when
  // down) — and the export works off the user's own Watching list, so it stays
  // useful even when the board can't load.
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="sr-only">Airing schedule</h1>
      {/* Live Japan + India clocks, centered above the board. */}
      <ScheduleClocks />

      <div className="mt-6">
        <div className="mb-4 flex flex-col gap-3">
          <AddToCalendarButton />
          <Suspense fallback={null}>
            <FeedSubscription />
          </Suspense>
        </div>
        <Suspense fallback={<ScheduleBoardSkeleton />}>
          <ScheduleBoard />
        </Suspense>
      </div>
    </main>
  );
}

/** One small owner-scoped read. Can't fail the page — the control just hides. */
async function FeedSubscription() {
  const feed = await getCalendarFeedStatus().catch(() => ({
    available: false,
    active: false,
  }));
  return feed.available ? <CalendarSubscription active={feed.active} /> : null;
}

async function ScheduleBoard() {
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
        <p className="mt-8 text-center text-sm text-destructive">
          Couldn&apos;t load the airing schedule right now. Please try again
          later.
        </p>
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
    <>
      <SourceNotice source={source} anilistLabel="Schedule via AniList" />
      <ScheduleList items={items} />
    </>
  );
}
