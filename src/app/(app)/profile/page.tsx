import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clapperboard, Eye, Megaphone, ShieldCheck } from "lucide-react";

import { AvatarUpload } from "@/components/AvatarUpload";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackgroundCard } from "@/components/profile/BackgroundCard";
import { ImportExportCard } from "@/components/profile/ImportExportCard";
import { PushToggle } from "@/components/profile/PushToggle";
import { SocialSettingsCard } from "@/components/profile/SocialSettingsCard";
import {
  ProfileStats,
  type ProfileProgressRow,
} from "@/components/profile/ProfileStats";
import { UsernameForm } from "@/components/UsernameForm";
import { isAdmin, requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/user";

export const metadata: Metadata = { title: "Profile · anime_maniacs" };

const HEATMAP_DAYS = 24 * 7;

/** Library rows + recent episode activity for the stats dashboard (RLS-scoped). */
async function getStats(): Promise<{
  progress: ProfileProgressRow[];
  activity: string[];
}> {
  const supabase = await createClient();
  const user = await requireUser();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - HEATMAP_DAYS);

  const [progressRes, activityRes] = await Promise.all([
    supabase
      .from("user_progress")
      .select("episodes_watched, status, score, anime:anime_id (genres)")
      // Required: public profiles' progress is readable too (migration 0015),
      // so unscoped stats would count strangers' libraries as your own.
      .eq("user_id", user.id),
    supabase
      .from("episode_progress")
      .select("watched_at")
      .gte("watched_at", since.toISOString()),
  ]);

  return {
    progress: (progressRes.data ?? []).map((r) => ({
      episodesWatched: r.episodes_watched,
      status: r.status,
      score: r.score,
      genres: r.anime?.genres ?? [],
    })),
    activity: (activityRes.data ?? []).map((r) => r.watched_at),
  };
}

export default async function ProfilePage() {
  const user = await requireUser();
  const stats = await getStats();
  const username =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";
  const avatarUrl =
    typeof user.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;
  const name = getDisplayName(user);
  const initial = name && name !== "Account" ? name[0]!.toUpperCase() : "?";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient text-2xl font-semibold tracking-tight">Profile</h1>

      <ProfileStats progress={stats.progress} activity={stats.activity} />

      <div className="mt-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <AvatarUpload
          userId={user.id}
          initialUrl={avatarUrl}
          fallbackInitial={initial}
        />
      </div>

      <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Signed in as
        </p>
        <p className="mt-1 truncate font-medium">{user.email}</p>
      </div>

      <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <UsernameForm initialUsername={username} />
      </div>

      {/* `/users/[username]` existed but nothing linked to it — you could not
          see the page other people see of you without typing the URL. */}
      {username ? (
        <Link
          href={`/users/${username}`}
          className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-primary/40"
        >
          <Eye className="size-5 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">View my public profile</span>
            <span className="block truncate text-xs text-muted-foreground">
              What friends see at /users/{username}
            </span>
          </span>
        </Link>
      ) : null}

      <SocialSettingsCard suggestedUsername={username || name} />

      <BackgroundCard />

      <ImportExportCard />

      <PushToggle />

      {/* The stylesheet has always carried a full light palette; until now
          `<html class="dark">` was hardcoded so it could never be used. */}
      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Appearance
          </p>
          <p className="mt-1 text-sm">Light, dark, or follow your system.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Switch experience
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition hover:ring-2 hover:ring-primary/40"
          >
            <Clapperboard className="size-4 text-primary" aria-hidden />
            Anime
          </Link>
          <Link
            href="/manga"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition hover:ring-2 hover:ring-primary/40"
          >
            <BookOpen className="size-4 text-primary" aria-hidden />
            Manga
          </Link>
        </div>
      </div>

      <Link
        href="/announcements"
        className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-primary/40"
      >
        <Megaphone className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Announcements</span>
      </Link>

      {isAdmin(user) ? (
        <Link
          href="/admin"
          className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-amber-500/30 transition hover:ring-amber-500/50"
        >
          <ShieldCheck className="size-5 text-amber-400" aria-hidden />
          <span className="font-medium">Admin dashboard</span>
        </Link>
      ) : null}

      <div className="mt-4">
        <LogoutButton className="w-full" />
      </div>
    </main>
  );
}
