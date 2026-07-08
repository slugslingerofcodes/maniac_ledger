import { Suspense } from "react";
import Link from "next/link";

import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { ContinueWatching } from "@/components/anime/ContinueWatching";
import { LibraryGrid } from "@/components/library-grid";
import { TrendingPosterMarquee } from "@/components/PosterMarquee";
import { TrendingPosterWall } from "@/components/PosterWall";
import { SiteHeader } from "@/components/site-header";
import { TopTenShowcase, type TopTenItem } from "@/components/TopTenShowcase";
import { buttonVariants } from "@/components/ui/button";
import { getTopTen, type TopWindow } from "@/lib/jikan";
import { cn } from "@/lib/utils";

function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-50">
      {/* Netflix-style poster collage behind the headline (gradient shows
          while it streams in / if Jikan is down). */}
      <Suspense fallback={null}>
        <TrendingPosterWall />
      </Suspense>
      {/* Subtle top sheen + vignette for depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
          Your anime, organized
        </p>
        <h1 className="text-gradient max-w-2xl font-didot text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Track everything you watch.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400">
          Build your library, follow your progress, and discover what to watch
          next — all in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/search"
            className={cn(
              buttonVariants(),
              "bg-primary text-primary-foreground shadow-[0_0_32px_-6px_rgba(99,102,241,0.7)] transition-transform hover:-translate-y-0.5 hover:bg-primary/90",
            )}
          >
            Browse anime
          </Link>
          <Link
            href="/recommendations"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "glass border-white/15 text-zinc-100 transition-transform hover:-translate-y-0.5 hover:text-white",
            )}
          >
            Recommendations
          </Link>
        </div>
      </div>

      {/* Full-bleed trending-poster marquee along the hero's bottom edge. */}
      <div className="relative pb-10">
        <Suspense fallback={null}>
          <TrendingPosterMarquee />
        </Suspense>
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

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <Hero />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={null}>
          <TopTen />
        </Suspense>
        <Suspense fallback={null}>
          <ContinueWatching />
        </Suspense>
        <div className="mb-4 mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Your Library</h2>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <LibraryGrid />
        </Suspense>
      </main>
    </div>
  );
}
