/**
 * Shared view-transition names, so a poster on any grid morphs into the
 * detail-page hero. The morph only fires when the outgoing and incoming
 * pages render the *same* name, which is the whole trick:
 *
 * - Library surfaces navigate by catalog uuid, discovery/search grids by MAL
 *   id (via /anime/mal/[malId] → redirect to the uuid page). The detail page
 *   knows both, so everyone keys on the MAL id when it exists and falls back
 *   to the uuid for MAL-less catalog rows.
 * - Names must also be unique per page, or React warns and the transition
 *   glitches — hence one name per anime, not per card slot.
 */
export function posterTransitionName(
  malId: number | null | undefined,
  id?: string | null,
): string {
  if (malId != null) return `poster-mal-${malId}`;
  return `poster-${id ?? "unknown"}`;
}
