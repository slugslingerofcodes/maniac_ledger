"use client";

import { useRef, useState, type TouchEvent } from "react";

type Options = {
  onRefresh: () => Promise<void> | void;
  /** Pull distance (px) required to trigger a refresh. */
  threshold?: number;
};

/**
 * Minimal touch pull-to-refresh. Engages only when the window is scrolled to the
 * top; applies resistance to the pull and fires `onRefresh` once the pull passes
 * `threshold`. Returns the live pull distance + handlers to spread on a wrapper.
 */
export function usePullToRefresh({ onRefresh, threshold = 80 }: Options) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: TouchEvent) {
    if (refreshing || window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: TouchEvent) {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // Downward pulls only; apply resistance and cap the travel.
    setPull(dy <= 0 ? 0 : Math.min(dy * 0.5, threshold * 1.5));
  }

  async function onTouchEnd() {
    if (startY.current === null) return;
    const shouldRefresh = pull >= threshold;
    startY.current = null;

    if (!shouldRefresh) {
      setPull(0);
      return;
    }

    setRefreshing(true);
    setPull(threshold);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  return {
    pull,
    refreshing,
    threshold,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
