"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Route template for the (app) group. `template.tsx` re-mounts on every
 * navigation, so this plays a traditional shōji sliding-door "open" each time
 * you switch tabs: two washi/kumiko panels start shut over the viewport and
 * part to reveal the new page. Skipped entirely under reduced motion.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <>
      {children}
      {reduce ? null : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[45] flex overflow-hidden"
        >
          <motion.div
            initial={{ x: 0 }}
            animate={{ x: "-101%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="shoji-panel h-full w-1/2 border-r-2 border-[oklch(0.32_0.03_60)]"
          />
          <motion.div
            initial={{ x: 0 }}
            animate={{ x: "101%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="shoji-panel h-full w-1/2 border-l-2 border-[oklch(0.32_0.03_60)]"
          />
        </div>
      )}
    </>
  );
}
