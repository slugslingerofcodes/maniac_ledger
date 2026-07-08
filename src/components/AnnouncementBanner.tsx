"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Announcement = { id: string; title: string; body: string };

/**
 * Slim banner under the nav showing the latest active announcement. Reads via
 * the browser Supabase client (RLS lets any signed-in user see active ones).
 * Dismissal is per-announcement, remembered in localStorage.
 */
export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase
      .from("announcements")
      .select("id, title, body")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        if (localStorage.getItem(`ann-dismissed-${data.id}`)) return;
        setAnnouncement(data);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!announcement) return null;

  function dismiss() {
    if (announcement) {
      localStorage.setItem(`ann-dismissed-${announcement.id}`, "1");
    }
    setAnnouncement(null);
  }

  return (
    <div className="pattern-seigaiha border-b border-primary/20 bg-primary/10">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <span aria-hidden>📢</span>
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">{announcement.title}</span>
          <span className="text-muted-foreground"> — {announcement.body}</span>
        </p>
        <Link
          href="/announcements"
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
