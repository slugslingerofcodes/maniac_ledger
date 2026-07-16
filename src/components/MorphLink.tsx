"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type MouseEvent, type ReactNode } from "react";

import { canMorph } from "@/lib/view-transition";

/**
 * A `<Link>` that morphs its poster into the detail-page hero, using the
 * browser's View Transitions API directly.
 *
 * Why by hand: Next 16's `viewTransition` experiment makes React's
 * `<ViewTransition>` component usable but does NOT wrap App Router navigations
 * in `document.startViewTransition`, so cross-route morphs never fire (verified
 * on the live site — startViewTransition was never called). So this component
 * wraps the navigation itself.
 *
 * How it stays clean:
 * - The `view-transition-name` is applied to the clicked poster (`[data-morph]`)
 *   only for the duration of the transition. If every grid poster carried the
 *   name at rest, the browser would lift them all out of the root snapshot and
 *   animate each one — here only the clicked poster morphs; the rest ride the
 *   default root cross-fade.
 * - The transition callback resolves once the destination hero (`[data-vtn]`
 *   with the matching name) has painted, so the browser captures the *new*
 *   snapshot with the hero in place. Capped so a slow detail page degrades to a
 *   cross-fade instead of freezing the old snapshot.
 * - Modified / middle / new-tab clicks, unsupported browsers, and reduced-motion
 *   all fall straight through to the plain `<Link>` navigation.
 */

/** How long to hold the old snapshot waiting for the hero before giving up. */
const TARGET_TIMEOUT_MS = 500;

/**
 * Resolve once the destination hero with this name is in the DOM (so the new
 * snapshot includes it), or after the cap. rAF, so it's a no-op in a hidden
 * tab — but a real navigation only happens in the foreground one.
 */
function awaitMorphTarget(name: string): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const painted = document.querySelector(`[data-vtn="${name}"]`);
      if (painted || performance.now() - start > TARGET_TIMEOUT_MS) {
        // One more frame so the hero is laid out before the new snapshot.
        requestAnimationFrame(() => resolve());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function MorphLink({
  href,
  name,
  children,
  className,
  ariaLabel,
  prefetch,
}: {
  href: string;
  /** Shared name for this anime — see `posterTransitionName`. */
  name: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  prefetch?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let the browser own new-tab / modified / non-primary clicks.
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    if (!canMorph()) return; // fall through to <Link>'s own navigation

    e.preventDefault();

    // Name only the clicked poster, for the duration of the transition.
    const poster = ref.current?.querySelector<HTMLElement>("[data-morph]") ?? null;
    const previous = poster?.style.viewTransitionName ?? "";
    if (poster) poster.style.viewTransitionName = name;

    const transition = document.startViewTransition(() => {
      router.push(href);
      return awaitMorphTarget(name);
    });
    transition.finished.finally(() => {
      if (poster) poster.style.viewTransitionName = previous;
    });
  }

  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      prefetch={prefetch}
    >
      {children}
    </Link>
  );
}
