"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Thin status bar shown only while the browser is offline. Renders nothing when
 * online, so it can sit at the top of a page unconditionally.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/20 bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-300"
    >
      Offline — showing cached library
    </div>
  );
}
