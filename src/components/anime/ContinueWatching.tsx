import Image from "next/image";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * "Continue Watching" row for the home page: the user's in-progress anime,
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
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        Continue Watching
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
              className="group w-40 shrink-0"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
                {anime.poster_url ? (
                  <Image
                    src={anime.poster_url}
                    alt={anime.title}
                    fill
                    sizes="160px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
              </div>

              <h3
                className="mt-2 line-clamp-1 text-sm font-medium"
                title={anime.title}
              >
                {anime.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Episode {nextEp}
                {hasTotal ? ` of ${total}` : ""}
              </p>
              {hasTotal ? (
                <Progress value={percent} className="mt-1.5 h-1" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
