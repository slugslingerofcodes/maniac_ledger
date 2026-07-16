/**
 * Shared view-transition names, so a poster on any grid morphs into the
 * detail-page hero. The morph only fires when the outgoing grid poster and the
 * incoming detail hero carry the *same* name, which is the whole trick:
 *
 * - Library surfaces navigate by catalog uuid, discovery/search grids by MAL
 *   id (via /anime/mal/[malId] → redirect to the uuid page). The detail page
 *   knows both, so everyone keys on the MAL id when it exists and falls back
 *   to the uuid for MAL-less catalog rows.
 *
 * The actual navigation + browser View Transitions API wiring lives in
 * `MorphLink` — Next 16 does not wrap App Router navigations in
 * `document.startViewTransition` on its own, so we do it there by hand.
 */
export function posterTransitionName(
  malId: number | null | undefined,
  id?: string | null,
): string {
  if (malId != null) return `poster-mal-${malId}`;
  return `poster-${id ?? "unknown"}`;
}

/**
 * Whether a morph should run: the browser supports the View Transitions API and
 * the user hasn't asked for reduced motion. Client-only — guards every caller
 * so SSR and unsupported browsers fall straight through to normal navigation.
 */
export function canMorph(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
