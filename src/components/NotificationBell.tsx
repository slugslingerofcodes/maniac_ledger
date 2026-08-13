"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { getReminders } from "@/app/actions/notifications";
import { Tooltip } from "@/components/ui/tooltip";

const SEEN_KEY = "anime-maniacs-reminders-seen";
const SEEN_CHANGE_EVENT = "reminders-seen-change";
const FIVE_MIN_MS = 5 * 60_000;

function subscribe(onChange: () => void) {
  window.addEventListener(SEEN_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

// Zero on the server: nothing is "seen" until the client says so, and the
// badge simply doesn't render server-side (the query has no data yet either).
const getServerSnapshot = (): number => 0;

/** Called by the inbox page to clear the badge. */
export function markRemindersSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* Storage disabled — the badge just won't clear. */
    return;
  }
  window.dispatchEvent(new Event(SEEN_CHANGE_EVENT));
}

/**
 * Unread badge over a link to the reminder inbox.
 *
 * "Unread" is tracked in localStorage rather than a `read_at` column: the
 * `notifications` table has no such column, there is no migration runner in
 * this project (0001–0026 are applied by hand in the SQL editor), and a feature
 * that silently does nothing until someone pastes SQL is worse than one that
 * works everywhere immediately. Per-device rather than per-account is an
 * honest trade for a badge.
 */
export function NotificationBell() {
  const seenAt = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { data } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => getReminders(),
    staleTime: FIVE_MIN_MS,
  });

  // Count what the user hasn't acknowledged: reminders whose date has arrived,
  // created since they last opened the inbox.
  const unread = (data ?? []).filter(
    (r) => r.due && new Date(r.createdAt).getTime() > seenAt,
  ).length;

  return (
    <Tooltip label="Reminders">
      <Link
        href="/notifications"
        aria-label={
          unread > 0 ? `Reminders, ${unread} ready to watch` : "Reminders"
        }
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}
