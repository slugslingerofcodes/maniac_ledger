import type { Metadata } from "next";

import { getReminders } from "@/app/actions/notifications";
import { requireUser } from "@/lib/supabase/auth";

import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = { title: "Reminders · anime_maniacs" };

// Per-user and time-sensitive (what's "due" changes at midnight).
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const reminders = await getReminders();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient text-2xl font-semibold tracking-tight">
        Reminders
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Air-date reminders you&apos;ve set. We also send these by email and, if
        you&apos;ve allowed it, push.
      </p>
      <NotificationsClient initial={reminders} />
    </main>
  );
}
