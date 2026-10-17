"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";

export type Announcement = { id: string; title: string; body: string };

export const dismissedKey = (id: string) => `ann-dismissed-${id}`;

/*
 * Dismissal lives in localStorage, which the server can't see — so the server
 * snapshot is "dismissed" and the banner first appears on the client, once it
 * knows. That never flashes a banner the user already closed, and never trips
 * a hydration mismatch. The `storage` event keeps other tabs in step.
 */
function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const serverDismissed = () => true;

/**
 * The banner itself: latest active announcement, dismissible per announcement.
 * The data comes from the server (`AnnouncementBanner`); this only owns the
 * per-browser dismissal.
 */
export function AnnouncementBannerView({
  announcement,
}: {
  announcement: Announcement;
}) {
  const key = dismissedKey(announcement.id);
  const storedDismissed = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(key) != null;
      } catch {
        return false;
      }
    },
    serverDismissed,
  );
  // Same-tab dismissals don't fire `storage`, so they're tracked here too.
  const [dismissedNow, setDismissedNow] = useState(false);

  if (storedDismissed || dismissedNow) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode / blocked storage: hide for this page view anyway */
    }
    setDismissedNow(true);
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
        <Tooltip label="Dismiss announcement">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
