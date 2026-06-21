"use client";

import { useRealtimeProgress } from "@/hooks/use-realtime-progress";

/**
 * Mount-only bridge so a Server Component page can subscribe to live progress
 * updates: it runs `useRealtimeProgress` and renders nothing.
 */
export function RealtimeProgress({
  animeId,
  userId,
}: {
  animeId: string;
  userId: string;
}) {
  useRealtimeProgress(animeId, userId);
  return null;
}
