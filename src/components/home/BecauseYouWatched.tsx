import Image from "next/image";
import Link from "next/link";

import { getAnimeRecommendations } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/**
 * "Because you watched X" — home-page rows seeded from the user's
 * highest-rated library entries, filled with MAL community recommendations
 * (already ranked by votes; day-cached in the Jikan client). Entries the user
 * already tracks are filtered out. Best-effort: renders nothing when the user
 * has no rated anime or Jikan is down.
 */
export async function BecauseYouWatched() {
  const supabase = await createClient();

  // Highest-rated watched entries with a MAL id (need it for the recs call),
  // plus the full set of tracked MAL ids so suggestions exclude the library.
  const { data } = await supabase
    .from("user_progress")
    .select("score, status, anime:anime_id (mal_id, title, title_english)")
    .in("status", ["watching", "completed"])
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(12);

  const { data: all } = await supabase
    .from("user_progress")
    .select("anime:anime_id (mal_id)");
  const tracked = new Set(
    (all ?? [])
      .map((r) => r.anime?.mal_id)
      .filter((id): id is number => id != null),
  );

  const seeds = (data ?? [])
    .filter((r) => r.anime?.mal_id != null)
    .slice(0, 2);
  if (seeds.length === 0) return null;

  const rows = (
    await Promise.all(
      seeds.map(async (seed) => {
        try {
          const recs = await getAnimeRecommendations(seed.anime!.mal_id!, 14);
          const items = recs.filter((r) => !tracked.has(r.malId)).slice(0, 10);
          return items.length >= 3
            ? {
                seedTitle: seed.anime!.title_english ?? seed.anime!.title,
                items,
              }
            : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row != null);

  if (rows.length === 0) return null;

  return (
    <section className="mt-12 flex flex-col gap-8">
      {rows.map((row) => (
        <div key={row.seedTitle}>
          <h2 className="text-gradient mb-3 text-lg font-semibold tracking-tight">
            Because you watched {row.seedTitle}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {row.items.map((item) => (
              <Link
                key={item.malId}
                href={`/anime/mal/${item.malId}`}
                className="group w-32 shrink-0 sm:w-36"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-primary/40">
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
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">
                  {item.title}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
