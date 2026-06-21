import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeList } from "@/components/anime/EpisodeList";
import { RealtimeProgress } from "@/components/anime/RealtimeProgress";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ensureEpisodes } from "@/lib/episodes";
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

function seasonLabel(season: string | null, year: number | null): string | null {
  if (!season && year == null) return null;
  const s = season ? season[0].toUpperCase() + season.slice(1) : null;
  return [s, year != null ? String(year) : null].filter(Boolean).join(" ");
}

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
    .select("title, synopsis")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Anime · AniTrack" };

  const description = data.synopsis?.trim()
    ? data.synopsis.trim().replace(/\s+/g, " ").slice(0, 155)
    : `Track your progress for ${data.title} on AniTrack.`;

  return {
    title: `${data.title} · AniTrack`,
    description,
  };
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

  // Anime row and the current user are independent — fetch together.
  const [{ data: anime, error }, user] = await Promise.all([
    supabase.from("anime").select("*").eq("id", id).maybeSingle(),
    getUser(),
  ]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-sm text-destructive">
            Couldn&apos;t load this anime. Please try again.
          </p>
        </div>
      </Shell>
    );
  }
  if (!anime) notFound();

  // Populate the episode catalog from Jikan on first view (best-effort; needs a
  // signed-in session per the episodes INSERT policy from migration 0005).
  // Must finish before we read the episodes table below.
  await ensureEpisodes(anime.id, anime.mal_id);

  // Episodes and the user's progress row don't depend on each other.
  const [{ data: episodes }, { data: progress }] = await Promise.all([
    supabase
      .from("episodes")
      .select("*")
      .eq("anime_id", id)
      .order("number", { ascending: true }),
    user
      ? supabase
          .from("user_progress")
          .select("episodes_watched, status, score")
          .eq("anime_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null as ProgressRow }),
  ]);

  // Which episodes are checked off — depends on the episode ids above.
  let watchedEpisodeIds: string[] = [];
  if (user && episodes && episodes.length > 0) {
    const { data: watchedRows } = await supabase
      .from("episode_progress")
      .select("episode_id")
      .in(
        "episode_id",
        episodes.map((e) => e.id),
      );
    watchedEpisodeIds = (watchedRows ?? []).map((r) => r.episode_id);
  }

  const year =
    anime.year ??
    (anime.airing_start ? new Date(anime.airing_start).getFullYear() : null);
  const season = seasonLabel(anime.season, year);

  return (
    <Shell>
      {/* Hero — full-width backdrop (blurred poster) + dark gradient overlay */}
      <section className="relative isolate overflow-hidden">
        {anime.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- poster hosts vary (MAL CDN, Supabase Storage); avoids next/image remote config.
          <img
            src={anime.poster_url}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-8 sm:px-6">
          <Link
            href="/library"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to library
          </Link>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
            {/* Poster floating on the left */}
            <div className="w-40 shrink-0 overflow-hidden rounded-xl bg-muted shadow-xl ring-1 ring-foreground/10 sm:w-52 sm:-mb-12">
              {anime.poster_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- see above.
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

            {/* Title / score / studio / season */}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="uppercase tracking-wide">
                  {anime.type}
                </Badge>
                <Badge variant="secondary">{AIRING_LABEL[anime.status]}</Badge>
                {anime.rating ? (
                  <Badge variant="outline">{RATING_LABEL[anime.rating]}</Badge>
                ) : null}
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {anime.title}
              </h1>
              {anime.title_english && anime.title_english !== anime.title ? (
                <p className="text-sm text-muted-foreground">
                  {anime.title_english}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {anime.score != null ? (
                  <span className="flex items-center gap-1 font-medium text-amber-400">
                    ★ {anime.score.toFixed(2)}
                  </span>
                ) : null}
                {anime.studio ? <span>{anime.studio}</span> : null}
                {season ? <span>{season}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Below the hero: synopsis (left) + tracking sidebar (right) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Synopsis */}
          <Card>
            <CardHeader>
              <CardTitle>Synopsis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {anime.synopsis?.trim() || "No synopsis available."}
              </p>
            </CardContent>
          </Card>

          {/* Sidebar: my status, rating, episode count, progress bar */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            {user ? (
              <>
                {/* Live-refresh this page when progress changes in another tab. */}
                <RealtimeProgress animeId={anime.id} userId={user.id} />
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
              </>
            ) : (
              <Card>
                <CardContent className="text-sm text-muted-foreground">
                  <Link href="/login" className="text-foreground underline">
                    Sign in
                  </Link>{" "}
                  to track your status, rating, and episode progress.
                </CardContent>
              </Card>
            )}
          </aside>
        </div>

        <Separator className="my-8" />

        {/* Full-width episode list */}
        <section>
          <h2 className="mb-3 text-base font-semibold">
            Episodes{" "}
            {episodes && episodes.length > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                ({episodes.length})
              </span>
            ) : null}
          </h2>
          {episodes && episodes.length > 0 ? (
            <EpisodeList
              animeId={anime.id}
              episodes={episodes}
              initialWatchedIds={watchedEpisodeIds}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No episode list available for this title.
            </p>
          )}
        </section>
      </div>
    </Shell>
  );
}

type ProgressRow = {
  episodes_watched: number;
  status: WatchStatus;
  score: number | null;
} | null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
