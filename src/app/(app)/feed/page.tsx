import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getFriendIds } from "@/app/actions/friends";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

export const metadata: Metadata = {
  title: "Feed · anime_maniacs",
  description: "What the people you follow are watching.",
};

/**
 * Activity feed: latest library updates from users you follow. Only public
 * profiles' rows are visible (RLS policy from migration 0015) — a followee
 * who goes private silently drops out of the feed.
 */

type FeedRow = {
  user_id: string;
  status: WatchStatus;
  score: number | null;
  episodes_watched: number;
  updated_at: string;
  anime: {
    id: string;
    title: string;
    title_english: string | null;
    poster_url: string | null;
  } | null;
};

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604_800) return `${Math.floor(secs / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function verbFor(row: FeedRow): string {
  if (row.status === "completed") return "finished";
  if (row.status === "watching") {
    return row.episodes_watched > 0
      ? `watched ep ${row.episodes_watched} of`
      : "started";
  }
  return `${WATCH_STATUS_META[row.status].label.toLowerCase()}:`;
}

export default async function FeedPage() {
  await requireUser();
  const supabase = await createClient();

  // My accepted friends — the feed is their recent activity.
  let friendIds: string[];
  try {
    friendIds = await getFriendIds();
  } catch {
    return (
      <Shell>
        <p className="mt-8 text-sm text-destructive">
          The feed isn&apos;t available yet — the friends migration (0020)
          hasn&apos;t been applied to the database.
        </p>
      </Shell>
    );
  }

  if (friendIds.length === 0) {
    return (
      <Shell>
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No friends yet. Head to{" "}
          <Link href="/friends" className="text-foreground underline">
            Friends
          </Link>{" "}
          to add some by username — once they accept, their activity shows up
          here.
        </p>
      </Shell>
    );
  }

  // Usernames for the byline + friends' latest activity (friends RLS lets us
  // read each other's rows, public or not).
  const [{ data: profiles }, { data: activity }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", friendIds),
    supabase
      .from("user_progress")
      .select(
        "user_id, status, score, episodes_watched, updated_at, anime:anime_id (id, title, title_english, poster_url)",
      )
      .in("user_id", friendIds)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const usernameById = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.username]),
  );
  const rows = ((activity ?? []) as FeedRow[]).filter((r) => r.anime);

  return (
    <Shell>
      {rows.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No public activity from the people you follow yet.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {rows.map((row, i) => {
            const username = usernameById.get(row.user_id);
            const title = row.anime!.title_english ?? row.anime!.title;
            return (
              <li
                key={`${row.user_id}-${row.anime!.id}-${i}`}
                className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
              >
                <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-muted">
                  {row.anime!.poster_url ? (
                    <Image
                      src={row.anime!.poster_url}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <p className="min-w-0 flex-1 text-sm leading-snug">
                  {username ? (
                    <Link
                      href={`/users/${username}`}
                      className="font-semibold hover:text-primary"
                    >
                      @{username}
                    </Link>
                  ) : (
                    <span className="font-semibold">Someone</span>
                  )}{" "}
                  <span className="text-muted-foreground">{verbFor(row)}</span>{" "}
                  <Link
                    href={`/anime/${row.anime!.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {title}
                  </Link>
                  {row.score != null ? (
                    <span className="text-amber-400"> ★ {row.score}</span>
                  ) : null}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(row.updated_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the people you follow are watching.
        </p>
      </div>
      {children}
    </main>
  );
}
