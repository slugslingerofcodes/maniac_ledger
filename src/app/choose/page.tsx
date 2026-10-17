import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clapperboard, Globe } from "lucide-react";

import { LeatherBackdrop } from "@/components/LeatherBackdrop";

export const metadata: Metadata = { title: "Choose · anime_maniacs" };

export default function ChoosePage() {
  return (
    // No bg-background: the backdrop below sits at -z-10, and an opaque page
    // background would paint straight over it.
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 text-foreground">
      {/* Plain blue leather, generated in CSS — this screen alone; every other
          page keeps the ambient vortex backdrop. It replaced a character
          portrait: the three cards are the whole content here, and artwork with
          a subject in it competed with them for the eye. */}
      <LeatherBackdrop fixed />

      <div className="mb-10 text-center">
        <h1 className="text-gradient text-3xl font-bold tracking-tight sm:text-5xl">
          What are you here for?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Pick a side — you can switch anytime from your profile.
        </p>
      </div>

      {/* Three sides now. Anime and Manga are both "what am I tracking";
          Community is the other question — what everyone else is watching —
          so it earns a card here rather than a row in the drawer.

          The anime card lands on the dashboard rather than a newsstand: the
          in-app broadsheet was retired when News was repointed at Anime
          Corner, and opening a session by leaving the app would be a strange
          way to pick a side. The manga side still has its own paper. */}
      <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-3">
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
          <span className="text-xs font-medium text-primary">
            Opens your dashboard →
          </span>
        </Link>

        <Link
          href="/manga/news"
          className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-10 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
            <BookOpen className="size-8" aria-hidden />
          </span>
          <span className="text-2xl font-semibold tracking-tight">Manga</span>
          <span className="text-sm text-muted-foreground">
            Track what you read — reading list, chapters and volumes.
          </span>
          <span className="text-xs font-medium text-primary">
            Opens the Manga Times →
          </span>
        </Link>

        <Link
          href="/community"
          className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-10 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
            <Globe className="size-8" aria-hidden />
          </span>
          <span className="text-2xl font-semibold tracking-tight">
            Community
          </span>
          <span className="text-sm text-muted-foreground">
            News, database and polls from Anime Corner, plus your feed.
          </span>
          <span className="text-xs font-medium text-primary">
            Opens the Community hub →
          </span>
        </Link>
      </div>
    </main>
  );
}
