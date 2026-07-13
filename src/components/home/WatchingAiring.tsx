import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getAnilistAiringSchedule } from "@/lib/anilist";
import { getSchedules } from "@/lib/jikan";
import { nextBroadcastMs, todayInJst } from "@/lib/jst";
import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** "23:00" JST → "11:00 PM" for the slot label. */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h! >= 12 ? "PM" : "AM";
  const h12 = ((h! + 11) % 12) + 1;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * "Airing from your watchlist": the user's *watching* anime that are still
 * ongoing, refreshed daily — shows dropping a new episode today (JST) lead
 * with a badge, the rest follow in next-broadcast order. Broadcast slots come
 * from the schedule feed (MAL, AniList fallback); ongoing shows without a
 * known slot trail as TBA. Renders nothing when signed out or when nothing
 * you're watching is airing.
 */
export async function WatchingAiring() {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_progress")
    .select(
      "episodes_watched, anime:anime_id (id, mal_id, title, title_english, poster_url, status)",
    )
    .eq("status", "watching");
  if (!data || data.length === 0) return null;

  // Broadcast slots by mal_id (best-effort; without them, catalog `status`
  // still identifies ongoing shows — they just sort as TBA).
  const slots = new Map<number, { day: string | null; time: string | null }>();
  try {
    const schedule = await getSchedules(4).catch(() => getAnilistAiringSchedule());
    for (const a of schedule) {
      slots.set(a.mal_id, {
        day: a.broadcast?.day ?? null,
        time: a.broadcast?.time ?? null,
      });
    }
  } catch {
    /* both schedule sources down — fall back to catalog status only */
  }

  const today = todayInJst();
  const items = data
    .map((row) => {
      const { anime } = row;
      const slot = anime.mal_id != null ? slots.get(anime.mal_id) : undefined;
      const ongoing = slot != null || anime.status === "currently_airing";
      if (!ongoing) return null;
      const isToday = slot?.day === today;
      return {
        id: anime.id,
        title: anime.title_english ?? anime.title,
        posterUrl: anime.poster_url,
        nextEp: row.episodes_watched + 1,
        day: slot?.day ?? null,
        time: slot?.time ?? null,
        isToday,
        // Epoch of the next broadcast for ordering; TBA slots sink last.
        nextAt: nextBroadcastMs(slot?.day ?? null, slot?.time ?? null) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.nextAt - b.nextAt);

  if (items.length === 0) return null;

  const todayCount = items.filter((i) => i.isToday).length;

  return (
    <section className="mb-10">
      <p className="text-sm text-muted-foreground">Ongoing · updates daily</p>
      <h2 className="text-gradient mb-1 text-2xl font-bold tracking-tight">
        Airing from your watchlist
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {todayCount > 0
          ? `${todayCount} new ${todayCount === 1 ? "episode" : "episodes"} today (JST).`
          : "Nothing new today — here's what's coming up."}
      </p>
      <div className="scrollbar-subtle flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/anime/${item.id}`}
            className="group w-36 shrink-0"
          >
            <div
              className={cn(
                "relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted ring-1 transition-shadow group-hover:ring-2 group-hover:ring-primary/40",
                item.isToday ? "ring-primary/50" : "ring-foreground/10",
              )}
            >
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  sizes="144px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
              {item.isToday ? (
                <Badge className="absolute left-1.5 top-1.5 border-transparent bg-primary text-primary-foreground shadow">
                  New today
                </Badge>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2">
                <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
                  {item.title}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-300">
                  {item.day
                    ? `${item.day.replace(/s$/, "")}${item.time ? ` · ${to12h(item.time)} JST` : ""}`
                    : "Schedule TBA"}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
