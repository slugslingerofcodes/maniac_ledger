import { Suspense } from "react";

import { ContinueWatching } from "@/components/anime/ContinueWatching";
import { BecauseYouWatchedRow } from "@/components/browse/BecauseYouWatchedRow";
import { DiscoverRow } from "@/components/browse/DiscoverRow";
import { LibraryRow } from "@/components/browse/LibraryRow";
import { BannerSkeleton, RowSkeleton } from "@/components/browse/RowSkeleton";
import { DiscoveryTabs } from "@/components/home/DiscoveryTabs";
import { GenreRibbon } from "@/components/home/GenreRibbon";
import { HeroCarousel, type HeroSlide } from "@/components/home/HeroCarousel";
import { MiniSchedule, type ScheduleDay } from "@/components/home/MiniSchedule";
import { ShareBanner } from "@/components/home/ShareBanner";
import { WatchingAiring } from "@/components/home/WatchingAiring";
import { TrendingPosterMarquee } from "@/components/PosterMarquee";
import { TopTenShowcase, type TopTenItem } from "@/components/TopTenShowcase";
import { getAnilistAiringSchedule, searchAnilist } from "@/lib/anilist";
import {
  posterOfJikan,
  toBrowseItem,
  trailerYoutubeId,
  uniqueByMalId,
  type BrowseItem,
} from "@/lib/browse-item";
import {
  getNewestAnime,
  getPopularAnime,
  getTopAiringAnime,
  getTopRatedAnime,
  getUpcomingAnime,
} from "@/lib/discovery";
import { getJustFinished, getSchedules, getTopMovies, type TopWindow } from "@/lib/jikan";
import { JST_DAYS, nowInJst, todayInJst } from "@/lib/jst";
import { getLibraryIndex } from "@/lib/library-snapshot";
import { getTopTenChart } from "@/lib/top-ten";
import { requireUser } from "@/lib/supabase/auth";

// Per-user page (library, continue-watching, personalized rows) — never
// prerender a shell at build time. Also keeps deploys from stalling on the
// serial rate-limited Jikan fetches when MAL is slow or down.
export const dynamic = "force-dynamic";

/*
 * Streaming layout. Every row below is its own async component inside its own
 * <Suspense>, and none awaits another: each starts its fetches the moment the
 * page renders, in parallel, and paints the moment *its* data is in. Rows
 * share work without sharing waits — the viewer's library is one cached query
 * (`getLibrarySnapshot`), and rows that draw on the same upstream list ask with
 * the same arguments so the Jikan/AniList caches de-duplicate them.
 *
 * Fallbacks: rows that are always there get a shimmer skeleton of their exact
 * size; personal rows that may legitimately be empty (Continue watching, …)
 * get none, so a new account never sees a placeholder collapse to nothing.
 */

/** "24 min per ep" → 24; null when unparsable. */
function parseDurationMins(duration: string | null | undefined): number | null {
  const m = /(\d+)\s*min/.exec(duration ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * One list feeds both the banner (first ten) and the "Airing now" row (the
 * rest), so the page asks for it once and never shows the same title twice in
 * its first two screens.
 */
const AIRING_LIST = 24;
const BANNER_SLIDES = 10;

async function HeroSection() {
  // Same MAL → AniList → catalog chain as the rows: the banner is the first
  // thing on the page, so it should be the last thing to collapse.
  const [airing, library] = await Promise.all([
    getTopAiringAnime(AIRING_LIST),
    getLibraryIndex(),
  ]);
  const slides: HeroSlide[] = airing.slice(0, BANNER_SLIDES).map((a) => ({
    ...toBrowseItem(a),
    durationMins: parseDurationMins(a.duration),
    broadcastDay: a.broadcast?.day ?? null,
    broadcastTime: a.broadcast?.time ?? null,
    airing: a.status === "Currently Airing",
    trailerId: trailerYoutubeId(a),
  }));
  if (slides.length === 0) return <HeroFallback />;
  return <HeroCarousel slides={slides} library={library} />;
}

/** Shown if every upstream is down: the banner's frame, with the app's promise. */
function HeroFallback() {
  return (
    <section className="banner-height relative isolate flex items-end overflow-hidden bg-banner pb-20 text-banner-foreground">
      <div className="row-gutter">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
          Your anime, organized
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Track everything you watch.
        </h1>
      </div>
    </section>
  );
}

async function AiringNowRow() {
  const [airing, library] = await Promise.all([
    getTopAiringAnime(AIRING_LIST),
    getLibraryIndex(),
  ]);
  // Past the banner's ten when the list is long enough; otherwise show it all
  // rather than a stub row.
  const rest = airing.length >= BANNER_SLIDES + 6 ? airing.slice(BANNER_SLIDES) : airing;
  return (
    <DiscoverRow
      title="Airing now"
      eyebrow="This season's most watched"
      href="/seasons"
      items={rest.map(toBrowseItem)}
      library={library}
    />
  );
}

/** One ranking window, mapped for the showcase; best-effort (empty on failure). */
async function topTenItems(window: TopWindow): Promise<TopTenItem[]> {
  // MAL → AniList → catalog; never throws (see top-ten.ts).
  const list = await getTopTenChart(window);
  return list.map((a) => ({ ...toBrowseItem(a), members: a.members ?? null }));
}

async function TopTen() {
  const [weekly, monthly, yearly, library] = await Promise.all([
    topTenItems("weekly"),
    topTenItems("monthly"),
    topTenItems("yearly"),
    getLibraryIndex(),
  ]);
  return <TopTenShowcase weekly={weekly} monthly={monthly} yearly={yearly} library={library} />;
}

async function Discovery() {
  // Each list runs MAL → AniList → catalog (src/lib/discovery.ts).
  const [newest, popular, topRated, library] = await Promise.all([
    getNewestAnime(18),
    // Same limit as the poster marquee, so the two share one cached call.
    getPopularAnime(18),
    getTopRatedAnime(18),
    getLibraryIndex(),
  ]);
  return (
    <DiscoveryTabs
      newest={newest.map(toBrowseItem)}
      popular={popular.map(toBrowseItem)}
      topRated={topRated.map(toBrowseItem)}
      library={library}
    />
  );
}

async function UpcomingRow() {
  const [items, library] = await Promise.all([getUpcomingAnime(18), getLibraryIndex()]);
  return (
    <DiscoverRow
      title="Coming soon"
      eyebrow="Announced, not yet airing"
      href="/upcoming"
      items={items.map(toBrowseItem)}
      library={library}
    />
  );
}

/*
 * Best-effort rows: the fetch lives in try/catch, the JSX doesn't. React
 * renders lazily, so JSX built inside a try block escapes it before any render
 * error can fire (react-hooks/error-boundaries) — and a fetch failure is the
 * only failure these rows are meant to swallow.
 */

async function JustFinishedRow() {
  // Started now, awaited last: the library read runs alongside the fetch.
  const libraryP = getLibraryIndex();
  let items: BrowseItem[];
  try {
    const { data } = await getJustFinished(18);
    items = uniqueByMalId(data.map(toBrowseItem));
  } catch {
    // MAL down → finished titles from AniList so the row still fills.
    try {
      const { data } = await searchAnilist({ status: "complete" }, 1);
      items = uniqueByMalId(data.map(toBrowseItem)).slice(0, 18);
    } catch {
      return null;
    }
  }
  const library = await libraryP;
  return <DiscoverRow title="Just finished" eyebrow="Complete and ready to binge" items={items} library={library} />;
}

async function TopMoviesRow() {
  const libraryP = getLibraryIndex();
  let items: BrowseItem[];
  try {
    const { data } = await getTopMovies(18);
    items = uniqueByMalId(data.map(toBrowseItem));
  } catch {
    // MAL down → top movies from AniList (by popularity) so the row stays.
    try {
      const { data } = await searchAnilist({ format: "movie" }, 1);
      items = uniqueByMalId(data.map(toBrowseItem)).slice(0, 18);
    } catch {
      return null;
    }
  }
  const library = await libraryP;
  return <DiscoverRow title="Top movies" href="/movies" items={items} library={library} />;
}

const SCHEDULE_DATE_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC", // nowInJst() encodes JST wall-clock in UTC fields
});

/** Yesterday / today / tomorrow (JST) with each day's releases, time-sorted. */
async function SchedulePanel() {
  let days: ScheduleDay[];
  try {
    // MAL primary, AniList fallback (JST slots derived from next airing eps).
    const all = await getSchedules(3).catch(() => getAnilistAiringSchedule());
    const todayName = todayInJst();
    const todayIdx = JST_DAYS.indexOf(todayName);

    days = [-1, 0, 1].map((offset) => {
      const dayName = JST_DAYS[(todayIdx + offset + 7) % 7]!;
      const date = new Date(nowInJst().getTime() + offset * 86_400_000);
      return {
        label: dayName.slice(0, 3),
        sub: SCHEDULE_DATE_FMT.format(date),
        isToday: offset === 0,
        rows: all
          .filter((a) => a.broadcast?.day === dayName && a.broadcast?.time)
          .sort((a, b) => (a.broadcast!.time ?? "").localeCompare(b.broadcast!.time ?? ""))
          .slice(0, 16)
          .map((a) => ({
            malId: a.mal_id,
            time: a.broadcast!.time ?? "--:--",
            title: a.title_english ?? a.title,
            posterUrl: posterOfJikan(a),
          })),
      };
    });
  } catch {
    return null;
  }
  return <MiniSchedule days={days} />;
}

export default async function Home() {
  // Defence in depth: the proxy already redirects signed-out visitors, but a
  // middleware bypass (Next has shipped advisories for exactly that) would
  // otherwise leave this page rendering. The server guard is the real gate.
  await requireUser();
  return (
    // `browse-scope` defines --gutter, which aligns every full-bleed row's
    // first card with the page container. No bg here: the fixed backdrop sits
    // behind the page. Nav and backdrop come from the (app) layout.
    <div className="browse-scope relative flex flex-1 flex-col">
      <Suspense fallback={<BannerSkeleton />}>
        <HeroSection />
      </Suspense>
      <GenreRibbon />

      <main className="flex w-full flex-1 flex-col pb-12">
        <Suspense fallback={null}>
          <ContinueWatching />
        </Suspense>
        <Suspense fallback={null}>
          <WatchingAiring />
        </Suspense>
        <Suspense fallback={null}>
          <BecauseYouWatchedRow />
        </Suspense>
        <Suspense fallback={<RowSkeleton eyebrow ranked count={6} />}>
          <TopTen />
        </Suspense>
        <Suspense fallback={<RowSkeleton eyebrow />}>
          <LibraryRow />
        </Suspense>

        <div className="row-gutter pt-8 empty:hidden">
          <ShareBanner />
        </div>

        <Suspense fallback={<RowSkeleton />}>
          <Discovery />
        </Suspense>
        {/* Trending posters as a full-width divider between row groups. */}
        <Suspense fallback={null}>
          <TrendingPosterMarquee />
        </Suspense>
        <Suspense fallback={<RowSkeleton eyebrow />}>
          <AiringNowRow />
        </Suspense>
        <Suspense fallback={<RowSkeleton eyebrow />}>
          <UpcomingRow />
        </Suspense>
        <Suspense fallback={<RowSkeleton eyebrow />}>
          <JustFinishedRow />
        </Suspense>
        <Suspense fallback={<RowSkeleton />}>
          <TopMoviesRow />
        </Suspense>
        <Suspense fallback={<RowSkeleton variant="schedule" eyebrow />}>
          <SchedulePanel />
        </Suspense>
      </main>
    </div>
  );
}
