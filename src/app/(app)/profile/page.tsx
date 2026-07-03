import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, ShieldCheck } from "lucide-react";

import { AvatarUpload } from "@/components/AvatarUpload";
import { LogoutButton } from "@/components/logout-button";
import { UsernameForm } from "@/components/UsernameForm";
import { isAdmin, requireUser } from "@/lib/supabase/auth";
import { getDisplayName } from "@/lib/user";

export const metadata: Metadata = { title: "Profile · anime_maniacs" };

export default async function ProfilePage() {
  const user = await requireUser();
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
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

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

      <Link
        href="/announcements"
        className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-indigo-500/40"
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
