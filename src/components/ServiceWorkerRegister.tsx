"use client";

import { useEffect } from "react";

/**
 * Registers /public/sw.js once on mount. Production-only — in dev the cache
 * layer would fight Turbopack HMR. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures (e.g. unsupported context) are non-fatal.
    });
  }, []);

  return null;
}
