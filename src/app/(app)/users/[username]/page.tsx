import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/social/FollowButton";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

/**
 * Public profile: /users/[username]. Private profiles show only the handle
 * and a notice — RLS already refuses their progress rows, the UI just says so
 * politely. Affinity = how closely the viewer's scores match on shared anime.
 */

type TheirRow = {
  status: WatchStatus;
  score: number | null;
  updated_at: string;
  anime: {
    id: string;
    title: string;
    title_english: string | null;
    poster_url: string | null;
  } | null;
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = rawUsername.toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) notFound();

  const viewer = await requireUser();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id, username, is_public")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <p className="text-sm text-destructive">
          Profiles aren&apos;t available yet — the social migration (0015)
          hasn&apos;t been applied to the database.
        </p>
      </main>
    );
  }
  if (!profile) notFound();

  const isSelf = profile.user_id === viewer.id;

  // Follower/following counts + whether the viewer already follows them.
  const [{ count: followers }, { count: followingCount }, { data: myEdge }] =
    await Promise.all([
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", profile.user_id),
      supabase
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", profile.user_id),
      supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", viewer.id)
        .eq("followee_id", profile.user_id)
        .maybeSingle(),
    ]);

  // Their library — RLS returns rows only when the profile is public (or self).
  const { data: theirRows } = await supabase
    .from("user_progress")
    .select(
      "status, score, updated_at, anime:anime_id (id, title, title_english, poster_url)",
    )
    .eq("user_id", profile.user_id)
    .order("updated_at", { ascending: false })
    .limit(200);

  const visible = profile.is_public || isSelf;
  const rows = (theirRows ?? []) as TheirRow[];

  // Affinity: mean |Δscore| over anime both rated, mapped to 0–100.
  let affinity: { percent: number; shared: number } | null = null;
  if (visible && !isSelf) {
    const { data: mine } = await supabase
      .from("user_progress")
      .select("anime_id, score")
      .eq("user_id", viewer.id);
    const myScores = new Map(
      (mine ?? [])
        .filter((r) => r.score != null)
        .map((r) => [r.anime_id, r.score as number]),
    );
    const theirsById = new Map(
      rows
        .filter((r) => r.anime && r.score != null)
        .map((r) => [r.anime!.id, r.score as number]),
    );
    const diffs: number[] = [];
    for (const [animeId, myScore] of myScores) {
      const theirScore = theirsById.get(animeId);
      if (theirScore != null) diffs.push(Math.abs(myScore - theirScore));
    }
    if (diffs.length >= 3) {
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      affinity = {
        percent: Math.round(Math.max(0, 100 - (avg / 9) * 100)),
        shared: diffs.length,
      };
    }
  }

  const statusCounts = new Map<WatchStatus, number>();
  for (const r of rows) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            @{profile.username}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {followers ?? 0} followers · {followingCount ?? 0} following
            {affinity
              ? ` · ${affinity.percent}% taste match (${affinity.shared} shared)`
              : ""}
          </p>
        </div>
        {!isSelf ? (
          <FollowButton
            followeeId={profile.user_id}
            initialFollowing={myEdge != null}
          />
        ) : (
          <Link
            href="/profile"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Edit profile
          </Link>
        )}
      </div>

      {!visible ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          This profile is private.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          Nothing tracked yet.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(WATCH_STATUS_META) as WatchStatus[]).map((s) =>
              statusCounts.get(s) ? (
                <Badge key={s} variant="secondary">
                  {WATCH_STATUS_META[s].label}: {statusCounts.get(s)}
                </Badge>
              ) : null,
            )}
          </div>

          <h2 className="mt-8 text-base font-semibold">Recently updated</h2>
          <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {rows.slice(0, 18).map((r) =>
              r.anime ? (
                <Link
                  key={r.anime.id}
                  href={`/anime/${r.anime.id}`}
                  className="group flex flex-col gap-1.5"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-primary/40">
                    {r.anime.poster_url ? (
                      <Image
                        src={r.anime.poster_url}
                        alt={r.anime.title}
                        fill
                        sizes="(max-width: 640px) 33vw, 160px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    {r.score != null ? (
                      <Badge className="absolute right-1.5 top-1.5 border-transparent bg-background/80 text-foreground backdrop-blur">
                        ★ {r.score}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">
                    {r.anime.title_english ?? r.anime.title}
                  </p>
                </Link>
              ) : null,
            )}
          </div>
        </>
      )}
    </main>
  );
}
