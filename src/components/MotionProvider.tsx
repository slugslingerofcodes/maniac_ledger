"use client";

import type { ReactNode } from "react";
import { LazyMotion } from "framer-motion";

import { loadDomMax } from "@/lib/lazy-motion";

/**
 * framer-motion's features for everything under the (app) and manga layouts,
 * fetched in an async chunk after hydration (see `lib/lazy-motion.ts`).
 *
 * Components render `m.*`, not `motion.*`: a single `motion` import anywhere
 * in a page's first-load graph — a card's `Tilt3D`, the episode list, the
 * library grid — puts framer's entire feature set back into that route's
 * first-load JS, which is why the layout-level change alone didn't move the
 * busiest routes. `domMax`, not `domAnimation`: the episode rows drag, and the
 * library grid and the tab bars' pill use layout animations.
 *
 * Deliberately not `strict` and not in the root layout: a `motion.*` that
 * slips in still works (it just costs the bytes), and the auth pages, which
 * animate nothing, never fetch the features at all.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadDomMax}>{children}</LazyMotion>;
}
