import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Music2 } from "lucide-react";

import { AnimeChat } from "@/components/anime/AnimeChat";
import { EpisodeList } from "@/components/anime/EpisodeList";
import { FranchiseCard } from "@/components/anime/FranchiseCard";
import { NextEpisodeBadge } from "@/components/anime/NextEpisodeBadge";
import { RealtimeProgress } from "@/components/anime/RealtimeProgress";
import { RewatchButton } from "@/components/anime/RewatchButton";
import { WatchOrder } from "@/components/anime/WatchOrder";
import { AddToListButton } from "@/components/lists/AddToListButton";
import { PosterLightbox } from "@/components/PosterLightbox";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AnimeInfoGrid, type AnimeInfo } from "@/components/anime/AnimeInfoGrid";
import { ensureEpisodes } from "@/lib/episodes";
import { genreChipStyle } from "@/lib/genre-color";
import { posterTransitionName } from "@/lib/view-transition";
import { getAnimeExtraInfo, type AnimeExtraInfo } from "@/lib/anilist";
import {
  getAnimeExtras,
  getAnimeRecommendations,
  type RelatedAnime,
  type SimilarAnime,
} from "@/lib/jikan";
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

const FORMAT_LABEL: Record<string, string> = {
  tv: "TV",
  movie: "Movie",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  music: "Music",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** {year,month,day} → "April 3, 2026" (drops missing parts). */
function fmtDateParts(
  d: { year: number | null; month: number | null; day: number | null } | null,
): string | null {
  if (!d || d.year == null) return null;
  const mon = d.month != null ? MONTHS[d.month - 1] : null;
  if (mon && d.day != null) return `${mon} ${d.day}, ${d.year}`;
  if (mon) return `${mon} ${d.year}`;
  return String(d.year);
}

/** ISO date string → "April 3, 2026", or null if unparseable. */
function fmtDateString(s: string | null): string | null {
  if (!s) return null;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
  if (!UUID_RE.test(id)) return { title: "Anime · anime_maniacs" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("anime")
    .select("title, synopsis")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Anime · anime_maniacs" };

  const description = data.synopsis?.trim()
    ? data.synopsis.trim().replace(/\s+/g, " ").slice(0, 155)
    : `Track your progress for ${data.title} on anime_maniacs.`;

  return {
    title: `${data.title} · anime_maniacs`,
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

  // Populate the episode catalog from Jikan on first view — and top it up on
  // every view while the show is airing, so newly aired episodes appear as
  // soon as MAL lists them (best-effort; needs a signed-in session per the
  // episodes INSERT policy from migration 0005). Must finish before we read
  // the episodes table below.
  await ensureEpisodes(anime.id, anime.mal_id, {
    airing: anime.status === "currently_airing",
  });

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

  // Trailer, genres, broadcast slot, and the season list come live from Jikan
  // (best-effort, cached 24h). Genres lazily backfill the catalog row
  // (pre-0014 rows fill in as they're viewed), feeding the library's filter.
  let trailerEmbedUrl: string | null = null;
  let genres: string[] = anime.genres ?? [];
  let related: RelatedAnime[] = [];
  let broadcastDay: string | null = null;
  let broadcastTime: string | null = null;
  let similar: SimilarAnime[] = [];
  let synonyms: string[] = [];
  let openings: string[] = [];
  let endings: string[] = [];
  let extraInfo: AnimeExtraInfo | null = null;
  if (anime.mal_id != null) {
    // Independent upstream calls; run them concurrently so a slow/timed-out
    // MAL (each request can hang ~10s during an outage) doesn't add up serially.
    // getAnimeExtraInfo hits AniList for the info-grid extras (author, country,
    // official site, adult flag, duration).
    const [extrasRes, similarRes, infoRes] = await Promise.allSettled([
      getAnimeExtras(anime.mal_id),
      getAnimeRecommendations(anime.mal_id, 12),
      getAnimeExtraInfo(anime.mal_id),
    ]);
    if (similarRes.status === "fulfilled") similar = similarRes.value;
    if (infoRes.status === "fulfilled") extraInfo = infoRes.value;

    if (extrasRes.status === "fulfilled") {
      const extras = extrasRes.value;
      trailerEmbedUrl = extras.trailerEmbedUrl;
      related = extras.related;
      broadcastDay = extras.broadcastDay;
      broadcastTime = extras.broadcastTime;
      synonyms = extras.synonyms;
      openings = extras.openings;
      endings = extras.endings;

      // Keep the cached catalog row current: episode totals, synopsis, status
      // and score drift on MAL while a show airs. Patch the in-memory row so
      // THIS render is fresh, and write back best-effort for everyone else.
      const patch: Partial<typeof anime> = {};
      if (
        extras.totalEpisodes != null &&
        extras.totalEpisodes !== anime.total_episodes
      ) {
        patch.total_episodes = extras.totalEpisodes;
      }
      if (extras.synopsis && extras.synopsis !== anime.synopsis) {
        patch.synopsis = extras.synopsis;
      }
      const freshStatus =
        extras.airingStatus === "Currently Airing"
          ? "currently_airing"
          : extras.airingStatus === "Finished Airing"
            ? "finished_airing"
            : extras.airingStatus === "Not yet aired"
              ? "not_yet_aired"
              : null;
      if (freshStatus && freshStatus !== anime.status) {
        patch.status = freshStatus;
      }
      if (extras.score != null && extras.score !== anime.score) {
        patch.score = extras.score;
      }
      if (Object.keys(patch).length > 0) {
        Object.assign(anime, patch);
        if (user) {
          // Best-effort write-back; RLS allows authenticated catalog updates.
          await supabase.from("anime").update(patch).eq("id", anime.id);
        }
      }
      if (genres.length === 0 && extras.genres.length > 0) {
        genres = extras.genres;
        if (user) {
          // Best-effort backfill; ignore failures (e.g. 0014 not applied yet).
          await supabase
            .from("anime")
            .update({ genres: extras.genres })
            .eq("id", anime.id);
        }
      }
    }
  }

  // Assemble the info-grid facts, preferring AniList extras where richer and
  // falling back to the catalog row. Rating shows AniList's /100 when we have
  // it, else the MAL /10 score.
  const startDate =
    fmtDateParts(extraInfo?.startDate ?? null) ??
    fmtDateString(anime.airing_start);
  const endDate =
    fmtDateParts(extraInfo?.endDate ?? null) ??
    fmtDateString(anime.airing_end);
  const durationText =
    extraInfo?.durationMinutes != null
      ? `${extraInfo.durationMinutes} min`
      : null;
  const ratingText =
    extraInfo?.averageScore != null
      ? `${extraInfo.averageScore} / 100`
      : anime.score != null
        ? `${anime.score} / 10`
        : null;
  const studios =
    extraInfo && extraInfo.studios.length > 0
      ? extraInfo.studios
      : anime.studio
        ? [anime.studio]
        : [];
  const animeInfo: AnimeInfo = {
    format: anime.type ? (FORMAT_LABEL[anime.type] ?? anime.type) : null,
    status: AIRING_LABEL[anime.status],
    episodes: anime.total_episodes,
    ratingText,
    durationText,
    season,
    author: extraInfo?.author ?? null,
    startDate,
    endDate,
    airing: anime.status === "currently_airing",
    dayOfAiring: broadcastDay,
    country: extraInfo?.countryOfOrigin ?? null,
    adult: extraInfo?.isAdult ?? null,
    studios,
    officialSite: extraInfo?.officialSite ?? null,
  };

  return (
    <Shell>
      {/* Hero — full-width backdrop (blurred poster) + dark gradient overlay */}
      <section className="relative isolate overflow-hidden">
        {anime.poster_url ? (
          <Image
            src={anime.poster_url}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="ken-burns scale-110 object-cover opacity-30 blur-2xl"
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
            {/* Poster floating on the left. `data-vtn` + the inline
                view-transition-name make this the morph target: a grid poster
                with the same name (see posterTransitionName) animates into it
                on navigation — MorphLink drives the transition and polls for
                this element by its data-vtn. */}
            <div className="w-40 shrink-0 sm:-mb-12 sm:w-52">
              {anime.poster_url ? (
                // Click-to-zoom: opens the full poster in a lightbox.
                <PosterLightbox src={anime.poster_url} alt={anime.title}>
                  <div
                    data-vtn={posterTransitionName(anime.mal_id, anime.id)}
                    style={{ viewTransitionName: posterTransitionName(anime.mal_id, anime.id) }}
                    className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted shadow-xl ring-1 ring-foreground/10"
                  >
                    <Image
                      src={anime.poster_url}
                      alt={anime.title}
                      fill
                      priority
                      sizes="(max-width: 640px) 160px, 208px"
                      className="object-cover"
                    />
                  </div>
                </PosterLightbox>
              ) : (
                <div className="relative flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground shadow-xl ring-1 ring-foreground/10">
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
              {synonyms.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">
                    Also known as:
                  </span>{" "}
                  {synonyms.slice(0, 6).join(" · ")}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {anime.score != null ? (
                  <ScoreRing
                    score={anime.score}
                    size={36}
                    color="oklch(0.83 0.14 85)"
                  />
                ) : null}
                {anime.studio ? <span>{anime.studio}</span> : null}
                {season ? <span>{season}</span> : null}
              </div>

              {genres.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {/* Same per-genre tints as the library/movies grids, so a
                      genre reads as the same color everywhere. */}
                  {genres.slice(0, 6).map((g) => (
                    <Badge
                      key={g}
                      className="border-transparent"
                      style={genreChipStyle(g)}
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {/* Live countdown to the next episode for ongoing titles. */}
              {anime.status === "currently_airing" ? (
                <div>
                  <NextEpisodeBadge day={broadcastDay} time={broadcastTime} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Information grid — format, dates, author, day of airing, country, … */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <AnimeInfoGrid info={animeInfo} />
      </div>

      {/* Below the hero: synopsis (left) + tracking sidebar (right) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-8 sm:px-6">
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
                <AddToListButton animeId={anime.id} />
                {progress?.status === "completed" ? (
                  <RewatchButton animeId={anime.id} />
                ) : null}
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

        {/* Trailer — embedded YouTube player, hidden when Jikan has none. */}
        {trailerEmbedUrl ? (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold">Trailer</h2>
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
              <iframe
                src={trailerEmbedUrl}
                title={`${anime.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="h-full w-full border-0"
              />
            </div>
          </section>
        ) : null}

        {/* Theme songs — OP/ED credits from MAL; "Listen" opens the player. */}
        {openings.length > 0 || endings.length > 0 ? (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Theme songs</h2>
              {anime.mal_id != null ? (
                <Link
                  href={`/songs?mal=${anime.mal_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/25"
                >
                  <Music2 className="size-3.5" aria-hidden />
                  Listen
                </Link>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Openings", openings],
                  ["Endings", endings],
                ] as const
              ).map(([label, list]) =>
                list.length > 0 ? (
                  <div
                    key={label}
                    className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                  >
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </h3>
                    <ul className="space-y-1.5">
                      {list.slice(0, 8).map((line) => (
                        <li
                          key={line}
                          className="flex items-baseline gap-2 text-sm leading-snug"
                        >
                          <Music2
                            className="size-3.5 shrink-0 translate-y-0.5 text-primary"
                            aria-hidden
                          />
                          <span className="min-w-0">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          </section>
        ) : null}

        {/* Season list — prequels/sequels/side stories from MAL relations. */}
        {related.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold">Seasons &amp; related</h2>
            <div className="flex flex-col gap-2">
              {related.slice(0, 10).map((r) => (
                <Link
                  key={`${r.relation}-${r.malId}`}
                  href={`/anime/mal/${r.malId}`}
                  className="group flex items-center gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
                >
                  <Badge variant="outline" className="w-28 shrink-0 justify-center">
                    {r.relation}
                  </Badge>
                  <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                    {r.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Personalized picks — shown for EVERY anime, whether or not it's in
            your library. Once you've watched (or are watching) it the heading
            is "Because you watched X"; otherwise "If you like X". Sourced from
            MAL community recommendations. */}
        {similar.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold">
              {progress?.status === "completed" || progress?.status === "watching"
                ? `Because you watched ${anime.title_english ?? anime.title}`
                : `If you like ${anime.title_english ?? anime.title}`}
            </h2>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {similar.map((s) => (
                <Link
                  key={s.malId}
                  href={`/anime/mal/${s.malId}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
                    {s.posterUrl ? (
                      <Image
                        src={s.posterUrl}
                        alt={s.title}
                        fill
                        sizes="(max-width: 640px) 33vw, 200px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {s.title}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Franchise watch order — release-ordered, with your progress. */}
        {anime.franchise_id ? (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold">
              Franchise watch order
            </h2>
            <Suspense
              fallback={
                <FranchiseCard franchiseId={anime.franchise_id} variant="list" />
              }
            >
              <WatchOrder
                franchiseId={anime.franchise_id}
                currentAnimeId={anime.id}
              />
            </Suspense>
          </section>
        ) : null}

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

        <Separator className="my-8" />

        {/* Per-anime chat room — live via Realtime (migration 0013). */}
        <section>
          <h2 className="mb-3 text-base font-semibold">Discussion</h2>
          <AnimeChat animeId={anime.id} />
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
    // No opaque bg-background: the galaxy backdrop the (app) layout mounts for
    // /anime/* sits at -z-10 and shows through the gaps between the hero
    // gradient and the content cards. Nav comes from that layout too.
    <div className="relative flex flex-1 flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}
