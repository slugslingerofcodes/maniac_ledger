"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps Tab inside an open overlay and puts focus back where it came from on
 * close.
 *
 * Both the nav drawer and the command palette painted a scrim over the page but
 * left the document behind it fully tabbable — a keyboard user pressing Tab
 * walked straight out of the dialog into links they couldn't see, and on close
 * focus landed at the top of the document rather than on the control they'd
 * opened it with. Neither surface announced itself as a dialog either, so a
 * screen reader read the page underneath as if nothing had happened.
 *
 * Returns a ref to put on the overlay container.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Focus the first control unless something inside already claimed it
    // (the palette's input autofocuses itself).
    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) return;

      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      // Focus may sit outside the container (e.g. on <body> after a click on
      // the scrim); wrap it back in rather than letting Tab escape.
      if (!container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only restore if focus is still inside (or nowhere) — if the user has
      // deliberately clicked elsewhere, don't yank them back.
      const activeEl = document.activeElement;
      if (
        restoreRef.current?.isConnected &&
        (activeEl === document.body ||
          activeEl === null ||
          container.contains(activeEl))
      ) {
        restoreRef.current.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return containerRef;
}
