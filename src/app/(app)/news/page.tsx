import type { Metadata } from "next";
import Image from "next/image";

import { getAnimeHotPosts, type RedditPost } from "@/lib/reddit";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Anime Times · anime_maniacs",
  description: "The community broadsheet — hot off the r/anime presses.",
};

// A newspaper is only good the day it's printed: re-fetch on every visit.
export const dynamic = "force-dynamic";

const DATELINE_FMT = new Intl.DateTimeFormat("en", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function timeAgo(unixSeconds: number): string {
  const mins = Math.max(1, Math.floor(Date.now() / 1000 - unixSeconds) / 60);
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function NewsPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let posts: RedditPost[];
  try {
    posts = await getAnimeHotPosts(30);
  } catch {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Masthead />
        <p className="mt-8 text-center font-serif text-sm text-destructive">
          The presses jammed — couldn&apos;t load community news. Please try
          again later.
        </p>
      </main>
    );
  }

  // Lead story: the first post that has art; the rest fill the columns.
  const leadIndex = posts.findIndex((p) => p.thumbnail);
  const lead = leadIndex === -1 ? posts[0] : posts[leadIndex];
  const rest = posts.filter((p) => p !== lead);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 font-serif sm:px-6">
      <Masthead />

      {posts.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nothing on the wire right now.
        </p>
      ) : (
        <>
          {/* Front-page lead */}
          {lead ? (
            <a
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 grid gap-5 border-b-2 border-foreground/50 pb-6 sm:grid-cols-[1fr_260px]"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                  Front page
                </p>
                <h2 className="mt-2 font-didot text-3xl font-bold leading-tight tracking-tight group-hover:underline sm:text-4xl">
                  {lead.title}
                </h2>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  {lead.author ? `By u/${lead.author}` : "Staff report"} ·{" "}
                  {timeAgo(lead.createdUtc)} · r/anime wire
                </p>
              </div>
              {lead.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lead.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-44 w-full rounded-sm object-cover grayscale ring-1 ring-foreground/20 transition duration-300 group-hover:grayscale-0 sm:h-full"
                />
              ) : null}
            </a>
          ) : null}

          {/* The columns */}
          <div className="mt-6 gap-8 sm:columns-2 lg:columns-3 [column-rule:1px_solid_oklch(1_0_0/0.12)]">
            {rest.map((post) => (
              <article
                key={post.id}
                className="mb-5 break-inside-avoid border-b border-dotted border-foreground/25 pb-5"
              >
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.thumbnail}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="mb-3 h-32 w-full rounded-sm object-cover grayscale ring-1 ring-foreground/20 transition duration-300 group-hover:grayscale-0"
                    />
                  ) : null}
                  <h3 className="font-didot text-lg font-bold leading-snug group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {post.author ? `By u/${post.author}` : "Staff report"} ·{" "}
                    {timeAgo(post.createdUtc)}
                  </p>
                </a>
              </article>
            ))}
          </div>

          <p className="border-t-2 border-foreground/50 pt-3 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Anime Times · printed fresh on every visit · stories open on
            r/anime
          </p>
        </>
      )}
    </main>
  );
}

/** "ANIME ⊙ TIMES" masthead with the monogram set between the words. */
function Masthead() {
  return (
    <header className="text-center">
      <p className="border-y border-foreground/30 py-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        The community broadsheet
      </p>
      <h1 className="mt-3 flex items-center justify-center gap-3 sm:gap-4">
        <span className="font-didot text-5xl font-bold tracking-tight sm:text-7xl">
          ANIME
        </span>
        <Image
          src="/icon-192.png"
          alt=""
          aria-hidden
          width={64}
          height={64}
          className="size-12 shrink-0 sm:size-16"
        />
        <span className="font-didot text-5xl font-bold tracking-tight sm:text-7xl">
          TIMES
        </span>
      </h1>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y-4 border-double border-foreground/50 px-1 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{DATELINE_FMT.format(new Date())}</span>
        <span className="hidden sm:inline">Hot off the r/anime presses</span>
        <span>Free edition</span>
      </div>
    </header>
  );
}
