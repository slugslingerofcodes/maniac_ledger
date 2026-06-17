import { Suspense } from "react";
import Link from "next/link";

import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { LibraryGrid } from "@/components/library-grid";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_60%)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-indigo-300/80">
          Your anime, organized
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Track everything you watch.
        </h1>
        <p className="mt-4 max-w-xl text-zinc-400">
          Build your library, follow your progress, and discover what to watch
          next — all in one place.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/search"
            className={cn(buttonVariants(), "bg-indigo-500 text-white hover:bg-indigo-400")}
          >
            Browse anime
          </Link>
          <Link
            href="/stats"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white",
            )}
          >
            View stats
          </Link>
        </div>
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

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <Hero />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Your Library</h2>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <LibraryGrid />
        </Suspense>
      </main>
    </div>
  );
}
