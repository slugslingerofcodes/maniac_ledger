"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * A small spinner that appears while its parent `<Link>`'s navigation is in
 * flight. Must be rendered *inside* a `<Link>` — `useLinkStatus` reads the
 * status of the nearest one.
 *
 * Worth having here specifically because every route in this app is dynamic
 * (each reads `cookies()` for auth), so a click can't resolve from cache the
 * way a static route would, and because `ShojiDoors` holds the navigation for
 * its close animation. Without this, tapping a drawer row looked identical to
 * tapping nothing at all until the doors finished.
 *
 * Always rendered, toggling opacity rather than mounting: per Next's guidance,
 * an indicator that appears and disappears from the flow shifts the layout of
 * the row it lives in, which is worse than the problem it solves. If the route
 * was already prefetched the pending phase is skipped and this never shows —
 * which is the intended outcome, not a failure.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className={cn(
        "size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent opacity-0 transition-opacity duration-150",
        pending && "opacity-70 motion-safe:animate-spin",
        className,
      )}
    />
  );
}
