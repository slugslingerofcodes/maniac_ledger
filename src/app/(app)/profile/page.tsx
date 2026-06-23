import type { Metadata } from "next";

import { LogoutButton } from "@/components/logout-button";
import { UsernameForm } from "@/components/UsernameForm";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Profile · anime_maniacs" };

export default async function ProfilePage() {
  const user = await requireUser();
  const username =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Signed in as
        </p>
        <p className="mt-1 truncate font-medium">{user.email}</p>
      </div>

      <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <UsernameForm initialUsername={username} />
      </div>

      <div className="mt-4">
        <LogoutButton className="w-full" />
      </div>
    </main>
  );
}
