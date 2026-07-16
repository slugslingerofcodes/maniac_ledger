import { Suspense } from "react";

import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { ContinueWatching } from "@/components/anime/ContinueWatching";
import { DiscoveryTabs, type DiscoveryItem } from "@/components/home/DiscoveryTabs";
import { GenreRibbon } from "@/components/home/GenreRibbon";
import { HeroCarousel, type HeroSlide } from "@/components/home/HeroCarousel";
import { MiniSchedule, type ScheduleDay } from "@/components/home/MiniSchedule";
import { ShareBanner } from "@/components/home/ShareBanner";
import { WatchingAiring } from "@/components/home/WatchingAiring";
import { SidebarList, type SidebarListItem } from "@/components/home/SidebarList";
import { LibraryGrid } from "@/components/library-grid";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { TrendingPosterMarquee } from "@/components/PosterMarquee";
import { SiteHeader } from "@/components/site-header";
import { TopTenShowcase, type TopTenItem } from "@/components/TopTenShowcase";
import { getAnilistAiringSchedule } from "@/lib/anilist";
import {
  getJustFinished,
  getSchedules,
  getSeasonNow,
  getTopAnime,
  getTopByPopularity,
  getTopMovies,
  getTopRated,
  getTopTen,
  getUpcomingSeasons,
  type JikanAnime,
  type TopWindow,
} from "@/lib/jikan";
import { JST_DAYS, nowInJst, todayInJst } from "@/lib/jst";

// Per-user page (library, continue-watching, personalized rows) — never
// prerender a shell at build time. Also keeps deploys from stalling on the
// serial rate-limited Jikan fetches when MAL is slow or down.
export const dynamic = "force-dynamic";

/** "24 min per ep" → 24; null when unparsable. */
function parseDurationMins(duration: string | null | undefined): number | null {
  const m = /(\d+)\s*min/.exec(duration ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * Streaming-style hero: top airing anime as a rotating full-bleed showcase.
 * Fetched server-side (day-cached), mapped to a serializable slide payload for
 * the client carousel. Falls back to the static hero if Jikan is down.
 */
async function HeroSection() {
  let slides: HeroSlide[] = [];
  try {
    const { data } = await getTopAnime(10);
    slides = data.slice(0, 10).map((a) => ({
      malId: a.mal_id,
      title: a.title,
      titleEnglish: a.title_english,
      imageUrl:
        a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
      type: a.type ?? null,
      episodes: a.episodes,
      score: a.score,
      durationMins: parseDurationMins(a.duration),
      genres: (a.genres ?? []).slice(0, 2).map((g) => g.name),
      studio: a.studios?.[0]?.name ?? null,
      synopsis: a.synopsis,
      broadcastDay: a.broadcast?.day ?? null,
      broadcastTime: a.broadcast?.time ?? null,
      airing: a.status === "Currently Airing",
    }));
  } catch {
    // best-effort: fall through to the static hero
  }
  if (slides.length === 0) return <HeroFallback />;
  return <HeroCarousel slides={slides} />;
}

/** Static hero shown while the carousel streams in (and if Jikan is down). */
function HeroFallback() {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-50">
      <div className="mx-auto flex min-h-[540px] w-full max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
          Your anime, organized
        </p>
        <h1 className="text-gradient max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Track everything you watch.
        </h1>
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** One ranking window, mapped for the showcase; best-effort (empty on failure). */
async function topTenItems(window: TopWindow): Promise<TopTenItem[]> {
  try {
    const list = await getTopTen(window);
    return list.map((a) => ({
      malId: a.mal_id,
      title: a.title,
      posterUrl:
        a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
      score: a.score,
      type: a.type ?? null,
      members: a.members ?? null,
    }));
  } catch {
    return [];
  }
}

/** Server section: fetches all three charts, renders the tabbed Top 10. */
async function TopTen() {
  const [weekly, monthly, yearly] = await Promise.all([
    topTenItems("weekly"),
    topTenItems("monthly"),
    topTenItems("yearly"),
  ]);
  return <TopTenShowcase weekly={weekly} monthly={monthly} yearly={yearly} />;
}

/* -------------------------------------------------------------------------- */
/* Discovery dashboard (below Your Library)                                   */
/* -------------------------------------------------------------------------- */

const posterOf = (a: JikanAnime) =>
  a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null;

function toDiscoveryItem(a: JikanAnime): DiscoveryItem {
  return {
    malId: a.mal_id,
    title: a.title,
    titleEnglish: a.title_english,
    posterUrl: posterOf(a),
    type: a.type ?? null,
    year: a.year,
    episodes: a.episodes,
    score: a.score,
  };
}

function toSidebarItem(a: JikanAnime): SidebarListItem {
  return {
    malId: a.mal_id,
    title: a.title_english ?? a.title,
    posterUrl: posterOf(a),
    meta: [
      a.type,
      a.year != null ? String(a.year) : null,
      a.score != null ? `★ ${a.score}` : null,
      a.episodes != null ? `${a.episodes} ep` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Dedupes a Jikan list by mal_id (top charts can repeat ids). */
function dedupe(list: JikanAnime[]): JikanAnime[] {
  const seen = new Set<number>();
  return list.filter((a) =>
    seen.has(a.mal_id) ? false : (seen.add(a.mal_id), true),
  );
}

async function Discovery() {
  const [newest, popular, topRated] = await Promise.all([
    getSeasonNow(18).then((r) => r.data).catch(() => []),
    getTopByPopularity(18).then((r) => r.data).catch(() => []),
    getTopRated(18).then((r) => r.data).catch(() => []),
  ]);
  return (
    <DiscoveryTabs
      newest={dedupe(newest).slice(0, 18).map(toDiscoveryItem)}
      popular={dedupe(popular).slice(0, 18).map(toDiscoveryItem)}
      topRated={dedupe(topRated).slice(0, 18).map(toDiscoveryItem)}
    />
  );
}

async function TopAiringPanel() {
  try {
    const { data } = await getTopAnime(10);
    return (
      <SidebarList title="Top Airing" items={dedupe(data).slice(0, 6).map(toSidebarItem)} />
    );
  } catch {
    return null;
  }
}

async function UpcomingPanel() {
  try {
    const list = await getUpcomingSeasons(1);
    return (
      <SidebarList title="Upcoming" items={list.slice(0, 6).map(toSidebarItem)} />
    );
  } catch {
    return null;
  }
}

async function JustFinishedPanel() {
  try {
    const { data } = await getJustFinished(8);
    return (
      <SidebarList
        title="Just Finished"
        items={dedupe(data).slice(0, 5).map(toSidebarItem)}
      />
    );
  } catch {
    return null;
  }
}

async function TopMoviesPanel() {
  try {
    const { data } = await getTopMovies(8);
    return (
      <SidebarList
        title="Top Movies"
        items={dedupe(data).slice(0, 5).map(toSidebarItem)}
      />
    );
  } catch {
    return null;
  }
}

const SCHEDULE_DATE_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC", // nowInJst() encodes JST wall-clock in UTC fields
});

/** Yesterday / today / tomorrow (JST) with each day's releases, time-sorted. */
async function SchedulePanel() {
  try {
    // MAL primary, AniList fallback (JST slots derived from next airing eps).
    const all = await getSchedules(3).catch(() => getAnilistAiringSchedule());
    const todayName = todayInJst();
    const todayIdx = JST_DAYS.indexOf(todayName);

    const days: ScheduleDay[] = [-1, 0, 1].map((offset) => {
      const dayName = JST_DAYS[(todayIdx + offset + 7) % 7]!;
      const date = new Date(nowInJst().getTime() + offset * 86_400_000);
      return {
        label: dayName.slice(0, 3),
        sub: SCHEDULE_DATE_FMT.format(date),
        isToday: offset === 0,
        rows: all
          .filter((a) => a.broadcast?.day === dayName && a.broadcast?.time)
          .sort((a, b) =>
            (a.broadcast!.time ?? "").localeCompare(b.broadcast!.time ?? ""),
          )
          .slice(0, 9)
          .map((a) => ({
            malId: a.mal_id,
            time: a.broadcast!.time ?? "--:--",
            title: a.title_english ?? a.title,
          })),
      };
    });

    return <MiniSchedule days={days} />;
  } catch {
    return null;
  }
}

export default function Home() {
  return (
    // No bg-background here: the fixed vortex backdrop sits at -z-10 and an
    // opaque page background would cover it. The hero paints its own.
    <div className="relative flex min-h-screen flex-col">
      <AmbientBackdrop />
      <SiteHeader />
      <Suspense fallback={<HeroFallback />}>
        <HeroSection />
      </Suspense>
      <GenreRibbon />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={null}>
          <ContinueWatching />
        </Suspense>
        {/* Ongoing shows from the user's watchlist — new episodes each day. */}
        <Suspense fallback={null}>
          <WatchingAiring />
        </Suspense>
        {/* Trending poster marquee as a full-width divider between sections. */}
        <Suspense fallback={null}>
          <TrendingPosterMarquee />
        </Suspense>
        <Suspense fallback={null}>
          <TopTen />
        </Suspense>
        <div className="mb-4 mt-8 flex items-center justify-between">
          <h2 className="text-gradient text-lg font-semibold tracking-tight">
            Your Library
          </h2>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <LibraryGrid />
        </Suspense>

        {/* Discovery dashboard: tabs grid + airing/upcoming rails */}
        <section className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-6">
            <ShareBanner />
            <Suspense fallback={null}>
              <Discovery />
            </Suspense>
          </div>
          <div className="flex flex-col gap-6">
            <Suspense fallback={null}>
              <TopAiringPanel />
            </Suspense>
            <Suspense fallback={null}>
              <UpcomingPanel />
            </Suspense>
          </div>
        </section>

        {/* Bottom rails: just finished, movies, tonight's schedule */}
        <section className="mt-6 grid items-start gap-6 md:grid-cols-3">
          <Suspense fallback={null}>
            <JustFinishedPanel />
          </Suspense>
          <Suspense fallback={null}>
            <TopMoviesPanel />
          </Suspense>
          <Suspense fallback={null}>
            <SchedulePanel />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
