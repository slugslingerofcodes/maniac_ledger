import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ListChecks, Rss, Users } from "lucide-react";

import { ANIME_CORNER_LINKS } from "@/lib/anime-corner";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Community · anime_maniacs",
  description:
    "Anime Corner's news, database, polls and comparisons, plus your feed and friends.",
};

/** In-app social destinations, so the hub isn't only a set of exits. */
const IN_APP = [
  {
    label: "Feed",
    href: "/feed",
    Icon: Rss,
    blurb: "What the people you follow have been watching.",
  },
  {
    label: "Friends",
    href: "/friends",
    Icon: Users,
    blurb: "Find people, follow them, compare libraries.",
  },
  {
    label: "Lists",
    href: "/lists",
    Icon: ListChecks,
    blurb: "Your own rankings, shareable as a public list.",
  },
] as const;

/**
 * The third side of the app, alongside Anime and Manga.
 *
 * Anime and Manga are both "what am *I* tracking". This page is the other
 * question — what is everyone else saying — and it answers it from two
 * directions: Anime Corner for coverage from outside (news, their database,
 * their polls), and the app's own social pages for the people you follow.
 *
 * The Anime Corner cards are deliberately links rather than embedded content:
 * see `src/lib/anime-corner.ts` for why nothing is mirrored.
 */
export default async function CommunityPage() {
  await requireUser();

  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Community
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          What everyone else is watching
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Coverage and rankings from Anime Corner, plus the people you follow
          here.
        </p>
      </header>

      <section className="mt-10" aria-labelledby="anime-corner-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="anime-corner-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Anime Corner
          </h2>
          <span className="text-xs text-muted-foreground">
            Opens animecorner.me
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ANIME_CORNER_LINKS.map(({ label, href, Icon, blurb }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex gap-4 rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  {label}
                  <ExternalLink className="size-3.5 opacity-50" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {blurb}
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="in-app-heading">
        <h2 id="in-app-heading" className="text-lg font-semibold tracking-tight">
          In your app
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {IN_APP.map(({ label, href, Icon, blurb }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-110">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        Anime Corner is an independent publication. Links open on their site;
        nothing from it is reproduced here.
      </p>
    </main>
  );
}
