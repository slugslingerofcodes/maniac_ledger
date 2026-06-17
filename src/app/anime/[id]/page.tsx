import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  AiringStatus,
  ContentRating,
  WatchStatus,
} from "@/types/anime";

import { ProgressTracker } from "./progress-tracker";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AIRING_LABEL: Record<AiringStatus, string> = {
  not_yet_aired: "Not yet aired",
  currently_airing: "Airing",
  finished_airing: "Finished",
  hiatus: "On hiatus",
  cancelled: "Cancelled",
};

const RATING_LABEL: Record<ContentRating, string> = {
  g: "G",
  pg: "PG",
  pg_13: "PG-13",
  r_17: "R-17+",
  r_plus: "R+",
  rx: "Rx",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Anime · AniTrack" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("anime")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: data ? `${data.title} · AniTrack` : "Anime · AniTrack" };
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A non-UUID id can never match the uuid PK and would make Postgres throw,
  // so treat it as a 404 up front.
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();

  const { data: anime, error } = await supabase
    .from("anime")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-destructive">
          Couldn&apos;t load this anime. Please try again.
        </p>
      </Shell>
    );
  }
  if (!anime) notFound();

  const [{ data: episodes }, user] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, number, title, aired_date")
      .eq("anime_id", id)
      .order("number", { ascending: true }),
    getUser(),
  ]);

  let progress: {
    episodes_watched: number;
    status: WatchStatus;
    score: number | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("user_progress")
      .select("episodes_watched, status, score")
      .eq("anime_id", id)
      .maybeSingle();
    progress = data;
  }

  const watchedCount = progress?.episodes_watched ?? 0;
  const year =
    anime.year ?? (anime.airing_start ? new Date(anime.airing_start).getFullYear() : null);

  return (
    <Shell>
      <Link
        href="/library"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to library
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Poster + meta */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
            {anime.poster_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- poster hosts vary (MAL CDN, Supabase Storage); avoids next/image remote config.
              <img
                src={anime.poster_url}
                alt={anime.title}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center text-sm text-muted-foreground">
                No image
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Meta label="Type" value={anime.type?.toUpperCase()} />
            <Meta label="Status" value={AIRING_LABEL[anime.status]} />
            <Meta
              label="Episodes"
              value={anime.total_episodes != null ? String(anime.total_episodes) : "—"}
            />
            <Meta label="Year" value={year != null ? String(year) : "—"} />
            {anime.season ? (
              <Meta
                label="Season"
                value={anime.season[0].toUpperCase() + anime.season.slice(1)}
              />
            ) : null}
            <Meta
              label="Rating"
              value={anime.rating ? RATING_LABEL[anime.rating] : "—"}
            />
          </dl>
        </div>

        {/* Main column */}
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{anime.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="uppercase tracking-wide">
                {anime.type}
              </Badge>
              <Badge variant="secondary">{AIRING_LABEL[anime.status]}</Badge>
              {anime.rating ? (
                <Badge variant="outline">{RATING_LABEL[anime.rating]}</Badge>
              ) : null}
            </div>
          </div>

          {/* Synopsis */}
          <section>
            <h2 className="mb-2 text-base font-semibold">Synopsis</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {anime.synopsis?.trim() || "No synopsis available."}
            </p>
          </section>

          {/* Progress tracker */}
          {user ? (
            <ProgressTracker
              animeId={anime.id}
              totalEpisodes={anime.total_episodes}
              inLibrary={progress != null}
              initial={{
                episodesWatched: progress?.episodes_watched ?? 0,
                status: progress?.status ?? "plan_to_watch",
                score: progress?.score ?? null,
              }}
            />
          ) : (
            <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
              <Link href="/login" className="text-foreground underline">
                Sign in
              </Link>{" "}
              to track your progress.
            </div>
          )}

          {/* Episode list */}
          <section>
            <h2 className="mb-2 text-base font-semibold">
              Episodes{" "}
              {episodes && episodes.length > 0 ? (
                <span className="text-sm font-normal text-muted-foreground">
                  ({episodes.length})
                </span>
              ) : null}
            </h2>
            {episodes && episodes.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-foreground/10">
                {episodes.map((ep) => {
                  const watched = ep.number <= watchedCount;
                  return (
                    <li
                      key={ep.id}
                      className="flex items-center gap-3 bg-card px-4 py-2.5 text-sm"
                    >
                      <span
                        aria-hidden
                        className={
                          watched
                            ? "text-emerald-400"
                            : "text-muted-foreground/40"
                        }
                      >
                        {watched ? "✓" : "○"}
                      </span>
                      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                        {ep.number}
                      </span>
                      <span className="flex-1 truncate">
                        {ep.title ?? `Episode ${ep.number}`}
                      </span>
                      {ep.aired_date ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(ep.aired_date).toLocaleDateString()}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No episode list available for this title.
              </p>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value || "—"}</dd>
    </div>
  );
}
