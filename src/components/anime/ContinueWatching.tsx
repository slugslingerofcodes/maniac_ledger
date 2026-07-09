import Image from "next/image";
import Link from "next/link";

import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * "Watch History" row for the home page: the user's in-progress anime as large
 * landscape thumbnails (poster art center-cropped to 16:9 with an overlay),
 * most-recently-watched first. Renders nothing when signed out or when there's
 * nothing in progress. RLS scopes `user_progress` to the current user.
 */
export async function ContinueWatching() {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_progress")
    .select(
      "episodes_watched, last_watched_at, anime:anime_id (id, title, poster_url, total_episodes)",
    )
    .eq("status", "watching")
    .order("last_watched_at", { ascending: false, nullsFirst: false })
    .limit(8);

  if (error || !data || data.length === 0) return null;

  return (
    <section className="mb-10">
      <p className="text-sm text-muted-foreground">Your Watchlist</p>
      <h2 className="text-gradient mb-4 text-2xl font-bold tracking-tight">
        Watch History
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {data.map((row) => {
          const { anime } = row;
          const total = anime.total_episodes;
          const hasTotal = total != null && total > 0;
          // Next unwatched episode = one past the watched counter, clamped to the
          // finale. Drives the #ep-{number} anchor on the detail page.
          const nextEp = hasTotal
            ? Math.min(row.episodes_watched + 1, total!)
            : row.episodes_watched + 1;
          const percent = hasTotal
            ? Math.min(100, Math.round((row.episodes_watched / total!) * 100))
            : 0;

          return (
            <Link
              key={anime.id}
              href={`/anime/${anime.id}#ep-${nextEp}`}
              className="group w-72 shrink-0 sm:w-80"
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow group-hover:ring-2 group-hover:ring-primary/40">
                {anime.poster_url ? (
                  <Image
                    src={anime.poster_url}
                    alt={anime.title}
                    fill
                    sizes="320px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <h3
                    className="line-clamp-1 text-sm font-semibold text-white"
                    title={anime.title}
                  >
                    {anime.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-300">
                    Episode {nextEp}
                    {hasTotal ? ` of ${total}` : ""}
                  </p>
                  {hasTotal ? (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
