"use client";

import { useEffect } from "react";

import { refreshScrollTriggers } from "@/components/Parallax";

/**
 * Re-measures every ScrollTrigger on mount. Render it inside a streamed
 * Suspense boundary on a page that uses `ScrollReveal`/`Parallax`.
 *
 * ScrollTrigger caches each trigger's scroll offset when it is created. When a
 * boundary resolves after the reveals below it have mounted, the page changes
 * height under them: if it grew, they fire early (harmless); if it shrank — a
 * skeleton taller than the real content — a section can sit at opacity 0 in
 * plain view until you scroll past where it *used* to be. The document `load`
 * event refreshes triggers on a full page load, but a client-side navigation
 * streams its boundaries in with no such event, so this does it explicitly.
 */
export function ScrollTriggerRefresh() {
  useEffect(() => {
    refreshScrollTriggers();
  }, []);
  return null;
}
