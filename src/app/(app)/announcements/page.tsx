import type { Metadata } from "next";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Announcements · anime_maniacs" };

function fmt(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AnnouncementsPage() {
  await requireUser();

  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Updates from the anime_maniacs team.
      </p>

      {(announcements ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No announcements right now.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {announcements!.map((a) => (
            <article
              key={a.id}
              className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <h2 className="font-medium">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {a.body}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {fmt(a.created_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
