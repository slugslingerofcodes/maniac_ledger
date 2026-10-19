import { cache, Suspense } from "react";
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
import { HeroPoster } from "@/components/anime/HeroPoster";
import { ScoreRing } from "@/components/ScoreRing";
import { Parallax } from "@/components/Parallax";
import { ScrollReveal } from "@/components/ScrollReveal";
import { ScrollTriggerRefresh } from "@/components/ScrollTriggerRefresh";
import { Tilt3D } from "@/components/Tilt3D";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Anime,
  AnimeUpdate,
  ContentRating,
  WatchStatus,
} from "@/types/anime";

import { ProgressTracker } from "./progress-tracker";
import { posterUrl } from "@/lib/poster";

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

/**
 * How recently the catalog-sync function must have refreshed a row for the
 * page to paint its title details from the catalog alone. The sync runs every
 * 6h; a row older than this (or one it has never touched — a user's obscure
 * add) gets the live refresh as before.
 */
const CATALOG_FRESH_MS = 24 * 60 * 60 * 1000;

function syncedRecently(anime: Anime): boolean {
  if (!anime.synced_at) return false;
  return Date.now() - new Date(anime.synced_at).getTime() < CATALOG_FRESH_MS;
}

/** The catalog's trailer as a no-cookie, no-autoplay embed (what MAL's would become). */
function catalogTrailerEmbed(anime: Anime): string | null {
  return anime.trailer_youtube_id
    ? `https://www.youtube-nocookie.com/embed/${anime.trailer_youtube_id}`
    : null;
}

/**
 * The catalog row. Memoized per request so `generateMetadata`, the page and
 * every streamed section below share one query instead of each sending their
 * own.
 */
const getAnimeRow = cache(async (id: string) => {
  const supabase = await createClient();
  return supabase.from("anime").select("*").eq("id", id).maybeSingle();
});

/** What the page takes from MAL (Jikan) and AniList, on top of the catalog row. */
type Upstream = {
  /** The catalog row with MAL's fresher totals/synopsis/status/score applied. */
  anime: Anime;
  genres: string[];
  trailerEmbedUrl: string | null;
  related: RelatedAnime[];
  broadcastDay: string | null;
  broadcastTime: string | null;
  similar: SimilarAnime[];
  synonyms: string[];
  openings: string[];
  endings: string[];
  extraInfo: AnimeExtraInfo | null;
};

/**
 * Trailer, genres, broadcast slot, season list, recommendations and the
 * info-grid extras — live from Jikan and AniList, best-effort.
 *
 * This used to be awaited before the page rendered anything, so a slow MAL
 * (1–3s, or a ~10s timeout during an outage) held the whole page — hero,
 * synopsis, the user's own tracker — on a skeleton. Now only the sections that
 * show this data wait for it, each behind its own Suspense boundary; `cache`
 * makes them share one set of upstream calls rather than issuing their own.
 * Never rejects: every source settles independently and the catalog row is
 * the fallback for all of it.
 */
const getUpstream = cache(async (id: string): Promise<Upstream> => {
  const [{ data: row }, user] = await Promise.all([getAnimeRow(id), getUser()]);
  // The page has already 404'd on a missing row before anything awaits this.
  const anime: Anime = { ...row! };
  // Seeded from what the catalog-sync function stored, so a dead upstream
  // costs only what the catalog can't know (relations, themes, picks).
  const out: Upstream = {
    anime,
    genres: anime.genres ?? [],
    trailerEmbedUrl: catalogTrailerEmbed(anime),
    related: [],
    broadcastDay: anime.broadcast_day ?? null,
    broadcastTime: anime.broadcast_time ?? null,
    similar: [],
    synonyms: anime.title_synonyms ?? [],
    openings: [],
    endings: [],
    extraInfo: null,
  };
  if (anime.mal_id == null) return out;

  // Independent upstream calls; run them concurrently so a slow/timed-out
  // MAL (each request can hang ~10s during an outage) doesn't add up serially.
  // getAnimeExtraInfo hits AniList for the info-grid extras (author, country,
  // official site, adult flag, duration).
  const [extrasRes, similarRes, infoRes] = await Promise.allSettled([
    getAnimeExtras(anime.mal_id),
    getAnimeRecommendations(anime.mal_id, 12),
    getAnimeExtraInfo(anime.mal_id),
  ]);
  if (similarRes.status === "fulfilled") out.similar = similarRes.value;
  if (infoRes.status === "fulfilled") out.extraInfo = infoRes.value;
  if (extrasRes.status !== "fulfilled") return out;

  const extras = extrasRes.value;
  out.trailerEmbedUrl = extras.trailerEmbedUrl ?? out.trailerEmbedUrl;
  out.related = extras.related;
  if (extras.broadcastDay) {
    out.broadcastDay = extras.broadcastDay;
    out.broadcastTime = extras.broadcastTime;
  }
  if (extras.synonyms.length > 0) out.synonyms = extras.synonyms;
  out.openings = extras.openings;
  out.endings = extras.endings;

  // Keep the cached catalog row current: episode totals, synopsis, status
  // and score drift on MAL while a show airs. The streamed sections render the
  // patched copy; the write-back keeps the row fresh for everyone else.
  const patch: AnimeUpdate = {};
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
  Object.assign(anime, patch);
  const backfillGenres = out.genres.length === 0 && extras.genres.length > 0;
  if (backfillGenres) out.genres = extras.genres;

  if (user) {
    // Best-effort write-backs; RLS allows authenticated catalog updates. Kept
    // as two statements so a genres failure (e.g. 0014 not applied yet) can't
    // take the freshness patch down with it — but sent together, not in turn.
    const supabase = await createClient();
    await Promise.all([
      Object.keys(patch).length > 0
        ? supabase.from("anime").update(patch).eq("id", anime.id)
        : null,
      backfillGenres
        ? supabase.from("anime").update({ genres: extras.genres }).eq("id", anime.id)
        : null,
    ]);
  }
  return out;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Anime · anime_maniacs" };

  const { data } = await getAnimeRow(id);

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

  // The anime row, the user, and the user's progress row are all keyed by
  // things we already have (the route id, the session), so they go out
  // together: one round trip, not three in a row.
  const [{ data: anime, error }, user, progress] = await Promise.all([
    getAnimeRow(id),
    getUser(),
    getProgress(id),
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

  const year =
    anime.year ??
    (anime.airing_start ? new Date(anime.airing_start).getFullYear() : null);
  const season = seasonLabel(anime.season, year);
  // A row the sync refreshed today already says what MAL would: paint it as
  // final instead of swapping in a live copy that adds nothing.
  const fresh = syncedRecently(anime);
  const catalogHero = (
    <HeroDetails
      anime={anime}
      season={season}
      genres={anime.genres ?? []}
      synonyms={anime.title_synonyms ?? []}
      broadcastDay={anime.broadcast_day ?? null}
      broadcastTime={anime.broadcast_time ?? null}
    />
  );
  const catalogTrailer = catalogTrailerEmbed(anime);

  return (
    <Shell>
      {/* Hero — full-width backdrop (blurred poster) + dark gradient overlay */}
      <section className="relative isolate overflow-hidden">
        {/* The blurred backdrop drifts against the scroll (GSAP ScrollTrigger,
            scrubbed) so the hero gains depth as you read past it. Parallax
            transforms the wrapper; `ken-burns` transforms the image inside it,
            so the two compose instead of fighting. */}
        {anime.poster_url ? (
          <Parallax className="absolute inset-0 -z-10" distance={120} scale={1.15}>
            <Image
              src={anime.poster_url}
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              className="ken-burns scale-110 object-cover opacity-30 blur-2xl"
            />
          </Parallax>
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
                // Click-to-zoom lightbox + 3D float/tilt; still the morph target.
                <HeroPoster
                  src={anime.poster_url}
                  title={anime.title}
                  transitionName={posterTransitionName(anime.mal_id, anime.id)}
                />
              ) : (
                <div className="relative flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground shadow-xl ring-1 ring-foreground/10">
                  No image
                </div>
              )}
            </div>

            {/* Title / score / studio / season / next-episode countdown, from
                the catalog row at once. A row the sync hasn't refreshed today
                is then swapped for the MAL-refreshed copy when it lands. */}
            {fresh ? (
              catalogHero
            ) : (
              <Suspense fallback={catalogHero}>
                <LiveHeroDetails id={anime.id} season={season} />
              </Suspense>
            )}
          </div>
        </div>
      </section>

      {/* Information grid — format, dates, author, day of airing, country, … */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <ScrollReveal>
          <Suspense
            fallback={
              <AnimeInfoGrid
                info={buildAnimeInfo(anime, season, null, anime.broadcast_day ?? null)}
              />
            }
          >
            <LiveInfoGrid id={anime.id} season={season} />
          </Suspense>
        </ScrollReveal>
      </div>

      {/* Below the hero: synopsis (left) + tracking sidebar (right) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Synopsis. The sticky sidebar next to it stays unwrapped — a
              transformed ancestor would break position: sticky. */}
          <ScrollReveal direction="left">
            <Card>
              <CardHeader>
                <CardTitle>Synopsis</CardTitle>
              </CardHeader>
              <CardContent>
                {fresh ? (
                  <SynopsisText synopsis={anime.synopsis} />
                ) : (
                  <Suspense fallback={<SynopsisText synopsis={anime.synopsis} />}>
                    <LiveSynopsis id={anime.id} />
                  </Suspense>
                )}
              </CardContent>
            </Card>
          </ScrollReveal>

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

        {/* The trailer the catalog already has needs no upstream call. */}
        {catalogTrailer ? <TrailerSection title={anime.title} embedUrl={catalogTrailer} /> : null}

        {/* Theme songs, seasons & related, similar picks (and the trailer,
            when the catalog has none) — MAL-sourced, so streamed. Each hides
            itself when empty, so there is nothing to hold their place. */}
        <Suspense fallback={null}>
          <UpstreamSections
            id={anime.id}
            progressStatus={progress?.status ?? null}
            trailerShown={catalogTrailer != null}
          />
        </Suspense>

        {/* Franchise watch order — release-ordered, with your progress. */}
        {anime.franchise_id ? (
          <ScrollReveal direction="right">
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
          </ScrollReveal>
        ) : null}

        <Separator className="my-8" />

        {/* Full-width episode list. Tiny `amount`: the list can be thousands
            of pixels tall, so a larger visible-fraction threshold would never
            be reached and the section would stay hidden. Streamed: on a
            first view (and every view while airing) the list is backfilled
            from Jikan before it can be read. */}
        <ScrollReveal amount={0.05}>
          <Suspense fallback={<EpisodesSkeleton />}>
            <EpisodesSection
              animeId={anime.id}
              malId={anime.mal_id}
              airing={anime.status === "currently_airing"}
              signedIn={user != null}
            />
          </Suspense>
        </ScrollReveal>

        <Separator className="my-8" />

        {/* Per-anime chat room — live via Realtime (migration 0013). */}
        <ScrollReveal amount={0.1}>
        <section>
          <h2 className="mb-3 text-base font-semibold">Discussion</h2>
          <AnimeChat animeId={anime.id} />
        </section>
        </ScrollReveal>
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


/** The user's progress row for this anime, or null when signed out / untracked. */
async function getProgress(animeId: string): Promise<ProgressRow> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_progress")
    .select("episodes_watched, status, score")
    // Without the user filter this can match several rows (public
    // profiles' progress is readable since 0015) and maybeSingle then
    // errors outright — the tracker would silently show nothing.
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();
  return data;
}

/**
 * Assemble the info-grid facts, preferring AniList extras where richer and
 * falling back to the catalog row. Rating shows AniList's /100 when we have
 * it, else the MAL /10 score. With no extras this is the catalog-only grid the
 * page paints while the upstream calls are still in flight.
 */
function buildAnimeInfo(
  anime: Anime,
  season: string | null,
  extraInfo: AnimeExtraInfo | null,
  broadcastDay: string | null,
): AnimeInfo {
  const startDate =
    fmtDateParts(extraInfo?.startDate ?? null) ??
    fmtDateString(anime.airing_start);
  const endDate =
    fmtDateParts(extraInfo?.endDate ?? null) ??
    fmtDateString(anime.airing_end);
  const durationMins = extraInfo?.durationMinutes ?? anime.duration_mins ?? null;
  const durationText = durationMins != null ? `${durationMins} min` : null;
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
  return {
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
}

/** Badges, title, synonyms, score/studio/season, genres, next-episode countdown. */
function HeroDetails({
  anime,
  season,
  genres,
  synonyms,
  broadcastDay,
  broadcastTime,
}: {
  anime: Anime;
  season: string | null;
  genres: string[];
  synonyms: string[];
  broadcastDay: string | null;
  broadcastTime: string | null;
}) {
  return (
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
  );
}

async function LiveHeroDetails({ id, season }: { id: string; season: string | null }) {
  const up = await getUpstream(id);
  return (
    <HeroDetails
      anime={up.anime}
      season={season}
      genres={up.genres}
      synonyms={up.synonyms}
      broadcastDay={up.broadcastDay}
      broadcastTime={up.broadcastTime}
    />
  );
}

async function LiveInfoGrid({ id, season }: { id: string; season: string | null }) {
  const up = await getUpstream(id);
  return (
    <>
      <AnimeInfoGrid
        info={buildAnimeInfo(up.anime, season, up.extraInfo, up.broadcastDay)}
      />
      <ScrollTriggerRefresh />
    </>
  );
}

function SynopsisText({ synopsis }: { synopsis: string | null }) {
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
      {synopsis?.trim() || "No synopsis available."}
    </p>
  );
}

async function LiveSynopsis({ id }: { id: string }) {
  const up = await getUpstream(id);
  return <SynopsisText synopsis={up.anime.synopsis} />;
}

/** Embedded YouTube player. */
function TrailerSection({ title, embedUrl }: { title: string; embedUrl: string }) {
  return (
    <ScrollReveal>
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">Trailer</h2>
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
        <iframe
          src={embedUrl}
          title={`${title} trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="h-full w-full border-0"
        />
      </div>
    </section>
    </ScrollReveal>
  );
}

async function UpstreamSections({
  id,
  progressStatus,
  trailerShown,
}: {
  id: string;
  progressStatus: WatchStatus | null;
  /** The page already rendered the catalog's trailer. */
  trailerShown: boolean;
}) {
  const { anime, trailerEmbedUrl, openings, endings, related, similar } =
    await getUpstream(id);
  return (
    <>
      {/* Trailer, when the catalog had none and MAL does. */}
      {!trailerShown && trailerEmbedUrl ? (
        <TrailerSection title={anime.title} embedUrl={trailerEmbedUrl} />
      ) : null}

      {/* Theme songs — OP/ED credits from MAL; "Listen" opens the player. */}
      {openings.length > 0 || endings.length > 0 ? (
        <ScrollReveal direction="right">
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
        </ScrollReveal>
      ) : null}

      {/* Season list — prequels/sequels/side stories from MAL relations. */}
      {related.length > 0 ? (
        <ScrollReveal direction="left">
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
        </ScrollReveal>
      ) : null}

      {/* Personalized picks — shown for EVERY anime, whether or not it's in
          your library. Once you've watched (or are watching) it the heading
          is "Because you watched X"; otherwise "If you like X". Sourced from
          MAL community recommendations. */}
      {similar.length > 0 ? (
        <ScrollReveal amount={0.1}>
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold">
            {progressStatus === "completed" || progressStatus === "watching"
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
                <Tilt3D maxTilt={8} className="w-full" glareClassName="rounded-lg">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
                    {s.posterUrl ? (
                      <Image
                        src={posterUrl(s.posterUrl, "card")!}
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
                </Tilt3D>
                <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                  {s.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
        </ScrollReveal>
      ) : null}
      <ScrollTriggerRefresh />
    </>
  );
}

/**
 * The episode checklist. On a first view — and on every view while the show
 * airs, so newly aired episodes appear as soon as MAL lists them — the catalog
 * is backfilled from Jikan before it can be read (best-effort; needs a
 * signed-in session per the episodes INSERT policy from migration 0005),
 * which is why this streams rather than holding the page.
 */
async function EpisodesSection({
  animeId,
  malId,
  airing,
  signedIn,
}: {
  animeId: string;
  malId: number | null;
  airing: boolean;
  signedIn: boolean;
}) {
  await ensureEpisodes(animeId, malId, { airing });

  const supabase = await createClient();
  const { data: episodes } = await supabase
    .from("episodes")
    .select("*")
    .eq("anime_id", animeId)
    .order("number", { ascending: true });

  // Which episodes are checked off — depends on the episode ids above.
  let watchedEpisodeIds: string[] = [];
  if (signedIn && episodes && episodes.length > 0) {
    const { data: watchedRows } = await supabase
      .from("episode_progress")
      .select("episode_id")
      .in(
        "episode_id",
        episodes.map((e) => e.id),
      );
    watchedEpisodeIds = (watchedRows ?? []).map((r) => r.episode_id);
  }

  return (
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
          animeId={animeId}
          episodes={episodes}
          initialWatchedIds={watchedEpisodeIds}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No episode list available for this title.
        </p>
      )}
      <ScrollTriggerRefresh />
    </section>
  );
}

/** Mirrors the episode list in loading.tsx, so the swap doesn't jump. */
function EpisodesSkeleton() {
  return (
    <section>
      <Skeleton className="mb-3 h-5 w-28" />
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 bg-card px-4 py-2.5">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-6 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
