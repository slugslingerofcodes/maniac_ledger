/**
 * Loaders for `<LazyMotion features={…}>` in the always-mounted layout chrome
 * (the header drawer and the two bottom tab bars).
 *
 * A plain `motion.*` component carries framer-motion's entire feature set —
 * animation, gestures, drag, layout projection — and in a component mounted by
 * a layout, that weight sits in the first-load JS of every route. `m.*` under
 * `LazyMotion` renders the same markup with no features attached, and the
 * features arrive in an async chunk after hydration. Before they land an `m`
 * element simply renders at its target state (an open drawer is open, the
 * active tab's pill sits on the active tab) — nothing is hidden or broken,
 * it just isn't animated for that first moment.
 *
 * Pick the smallest bundle that covers what the component animates:
 * - `domAnimation` — animate/exit/variants and tap/hover/focus. The drawer.
 * - `domMax` — adds drag and layout animations, which `layoutId` needs. The
 *   tab bars' sliding pill.
 */
export const loadDomAnimation = () =>
  import("@/lib/motion-features").then((mod) => mod.domAnimation);

export const loadDomMax = () =>
  import("@/lib/motion-features").then((mod) => mod.domMax);
