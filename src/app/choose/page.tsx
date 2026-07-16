import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clapperboard } from "lucide-react";

import { ImageBackdrop } from "@/components/ImageBackdrop";

export const metadata: Metadata = { title: "Choose · anime_maniacs" };

export default function ChoosePage() {
  return (
    // No bg-background: the backdrop below sits at -z-10, and an opaque page
    // background would paint straight over it.
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 text-foreground">
      {/* This artwork belongs to the pick-a-side screen alone — every other
          page uses the ambient backdrop chosen in the profile. */}
      <ImageBackdrop src="/choose-bg.webp" fixed />

      <div className="mb-10 text-center">
        <h1 className="text-gradient text-3xl font-bold tracking-tight sm:text-5xl">
          What are you here for?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Pick a side — you can switch anytime from your profile.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <Link
          href="/"
          className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-10 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
            <Clapperboard className="size-8" aria-hidden />
          </span>
          <span className="text-2xl font-semibold tracking-tight">Anime</span>
          <span className="text-sm text-muted-foreground">
            Track what you watch — library, schedule, seasons and more.
          </span>
        </Link>

        <Link
          href="/manga"
          className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-10 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
            <BookOpen className="size-8" aria-hidden />
          </span>
          <span className="text-2xl font-semibold tracking-tight">Manga</span>
          <span className="text-sm text-muted-foreground">
            Track what you read — reading list, chapters and volumes.
          </span>
        </Link>
      </div>
    </main>
  );
}
