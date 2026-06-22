import { track as vercelTrack } from "@vercel/analytics";

/**
 * Typed custom-event map for Vercel Analytics. Each event's value is its allowed
 * props shape (Vercel only accepts string | number | boolean | null values).
 */
export type AnalyticsEvents = {
  anime_added: { malId: number; title: string; source: "search" | "recommendation" };
  episode_marked_watched: { animeId: string; episodeId: string };
  status_changed: { animeId: string; status: string };
  recommendation_clicked: { malId: number; title: string };
};

/**
 * Type-safe wrapper over Vercel Analytics' `track`. The event name constrains
 * the allowed props, so call sites can't drift from the schema above.
 */
export function track<E extends keyof AnalyticsEvents>(
  event: E,
  props: AnalyticsEvents[E],
) {
  vercelTrack(event, props);
}
