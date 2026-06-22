"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDown, Loader2 } from "lucide-react";

import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { cn } from "@/lib/utils";

/**
 * Wraps content with touch pull-to-refresh. The indicator and pull translation
 * are driven by `usePullToRefresh`; `onRefresh` runs when the pull is released
 * past the threshold (e.g. invalidating a query).
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const { pull, refreshing, threshold, handlers } = usePullToRefresh({
    onRefresh,
  });
  const ready = pull >= threshold;

  return (
    <div {...handlers} className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden"
        style={{ height: pull, opacity: pull > 8 ? 1 : 0 }}
      >
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowDown
              className={cn(
                "size-4 transition-transform",
                ready && "rotate-180",
              )}
            />
          )}
          {refreshing
            ? "Refreshing…"
            : ready
              ? "Release to refresh"
              : "Pull to refresh"}
        </div>
      </div>

      <motion.div
        animate={{ y: refreshing ? threshold * 0.5 : pull }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
