import { ViewTransition } from "react";
import type { ReactNode } from "react";

/**
 * `<ViewTransition>` with a pass-through fallback. Next.js serves a React
 * build where the export exists (the app's poster morphs use it); the npm
 * `react` package used by the test runner — and potentially a future stable —
 * doesn't. A named import that's absent is just `undefined` at runtime, so
 * without this guard every component using the morph would crash outside
 * Next instead of merely not animating.
 */
export const PosterTransition:
  | typeof ViewTransition
  | ((props: { name?: string; children: ReactNode }) => ReactNode) =
  typeof ViewTransition === "undefined"
    ? ({ children }: { name?: string; children: ReactNode }) => children
    : ViewTransition;
