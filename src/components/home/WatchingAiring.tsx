import { AdvanceEpisodeButton } from "@/components/anime/AdvanceEpisodeButton";
import { BrowseRow } from "@/components/browse/BrowseRow";
import { CardCaption, ExpandingCard } from "@/components/browse/ExpandingCard";
import { getScheduleAnime } from "@/lib/discovery";
import { nextBroadcastMs, todayInJst } from "@/lib/jst";
import { getLibrarySnapshot } from "@/lib/library-snapshot";

/** "23:00" JST → "11:00 PM" for the slot label. */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h! >= 12 ? "PM" : "AM";
  const h12 = ((h! + 11) % 12) + 1;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * "Airing from your list": the viewer's *watching* anime that are still
 * ongoing — shows dropping a new episode today (JST) lead with a badge, the
 * rest follow in next-broadcast order. Broadcast slots come from the schedule
 * (the catalog's synced snapshot, else MAL → AniList); ongoing shows without
 * a known slot trail as TBA. Renders nothing when nothing you're watching is
 * airing.
 */
export async function WatchingAiring() {
  const library = await getLibrarySnapshot();
  const watching = library.filter((r) => r.status === "watching");
  if (watching.length === 0) return null;

  // Broadcast slots by mal_id (best-effort; without them, catalog status
  // still identifies ongoing shows — they just sort as TBA).
  const slots = new Map<number, { day: string | null; time: string | null }>();
  // Never throws; [] when every source is down, and catalog status alone
  // then identifies the ongoing shows.
  for (const a of await getScheduleAnime()) {
    slots.set(a.mal_id, { day: a.broadcast?.day ?? null, time: a.broadcast?.time ?? null });
  }

  const today = todayInJst();
  const items = watching
    .map((row) => {
      const slot = row.malId != null ? slots.get(row.malId) : undefined;
      const ongoing = slot != null || row.airing === "currently_airing";
      if (!ongoing) return null;
      return {
        row,
        day: slot?.day ?? null,
        time: slot?.time ?? null,
        isToday: slot?.day === today,
        // Epoch of the next broadcast for ordering; TBA slots sink last.
        nextAt:
          nextBroadcastMs(slot?.day ?? null, slot?.time ?? null) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.nextAt - b.nextAt);

  if (items.length === 0) return null;

  const todayCount = items.filter((i) => i.isToday).length;

  return (
    <BrowseRow
      title="Airing from your list"
      eyebrow={
        todayCount > 0
          ? `${todayCount} new ${todayCount === 1 ? "episode" : "episodes"} today (JST)`
          : "Nothing new today — here's what's next"
      }
      href="/schedule"
      className="pt-4"
    >
      {items.map(({ row, day, time, isToday }) => {
        const title = row.titleEnglish ?? row.title;
        const slot = day
          ? `${day.replace(/s$/, "")}${time ? ` · ${to12h(time)} JST` : ""}`
          : "Schedule TBA";
        return (
          <ExpandingCard
            key={row.animeId}
            href={`/anime/${row.animeId}`}
            title={title}
            posterUrl={row.posterUrl}
            overlay={
              isToday ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-banner shadow">
                  New today
                </span>
              ) : null
            }
            panel={
              <>
                <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{title}</p>
                <p className="mt-1 text-[11px] text-banner-foreground/80">{slot}</p>
                <p className="mt-0.5 text-[11px] text-banner-foreground/60">
                  Next up: episode {row.episodesWatched + 1}
                </p>
              </>
            }
            actions={
              <AdvanceEpisodeButton
                animeId={row.animeId}
                title={title}
                episodesWatched={row.episodesWatched}
                totalEpisodes={row.totalEpisodes}
                status="watching"
                variant="full"
                source="rail"
              />
            }
            caption={<CardCaption title={title} meta={slot} />}
          />
        );
      })}
    </BrowseRow>
  );
}
