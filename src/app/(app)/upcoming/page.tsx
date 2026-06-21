import type { Metadata } from "next";

import { UpcomingCard } from "@/components/anime/UpcomingCard";
import { getUpcomingSeason } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Upcoming · AniTrack",
  description: "Anime coming next season — get a reminder when they air.",
};

export default async function UpcomingPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let upcoming;
  try {
    const res = await getUpcomingSeason(25);
    // Jikan's upcoming feed can list the same anime more than once — dedupe by
    // mal_id so React keys stay unique and cards don't repeat.
    const seen = new Set<number>();
    upcoming = res.data.filter((a) => {
      if (seen.has(a.mal_id)) return false;
      seen.add(a.mal_id);
      return true;
    });
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

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Header />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {upcoming.map((a) => (
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
    </main>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Upcoming Anime</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Coming next season. Tap the bell to be reminded when one airs.
      </p>
    </div>
  );
}
