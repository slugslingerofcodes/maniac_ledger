"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { nextRowIndex, ROW_FOCUS_ATTR, ROW_ITEM_ATTR } from "./row-nav";

/** Direct items of this track only — never a nested row's. */
const ITEM_SELECTOR = `:scope > [${ROW_ITEM_ATTR}]`;

function focusTargetOf(item: HTMLElement): HTMLElement | null {
  if (item.hasAttribute(ROW_FOCUS_ATTR)) return item;
  return (
    item.querySelector<HTMLElement>(`[${ROW_FOCUS_ATTR}]`) ??
    item.querySelector<HTMLElement>("a[href], button")
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * One horizontal browse row — the unit the whole home page is built from.
 *
 * - **Scroll-snap** track, swipeable on touch; full-bleed, with its first card
 *   aligned to the page container through `.row-gutter` (see globals.css).
 * - **Paddles** at either edge on fine pointers, shown on row hover and only in
 *   a direction that can still scroll. They page by whole cards, so a click
 *   never leaves a card cut in half at the edge.
 * - **Keyboard:** the row is a single tab stop (roving tabindex); ←/→ move
 *   between items and Home/End jump to the ends (`nextRowIndex`). Focus moves
 *   without the browser's own scroll jump, then the item is scrolled into view
 *   honouring the snap padding.
 *
 * Items are any children carrying `data-row-item` (and, inside, the element to
 * focus carrying `data-row-focus`) — `ExpandingCard` sets both. The roving
 * tabindex is applied to the DOM rather than through props so server-rendered
 * children work unchanged.
 */
export function BrowseRow({
  title,
  eyebrow,
  href,
  actions,
  children,
  resetKey,
  hideHeader = false,
  className,
  trackClassName,
}: {
  title: ReactNode;
  /** Small line above the title — what the row is, or why it's here. */
  eyebrow?: ReactNode;
  /** "See all" destination for the title. */
  href?: string;
  /** Right side of the header: tabs, a toggle. */
  actions?: ReactNode;
  children: ReactNode;
  /** Changing this scrolls the row back to its start (a tab switch). */
  resetKey?: string;
  /** Keep the heading for assistive tech only (the genre strip). */
  hideHeader?: boolean;
  className?: string;
  trackClassName?: string;
}) {
  const headingId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const items = useCallback((): HTMLElement[] => {
    const track = trackRef.current;
    return track ? Array.from(track.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : [];
  }, []);

  // Only the active item is reachable with Tab — its link *and* its own
  // controls (quick actions, the +1 button), so Tab can step into the card
  // you're on. Every other item's controls drop out of the tab order.
  const applyRoving = useCallback(() => {
    const list = items();
    if (list.length === 0) return;
    if (activeRef.current > list.length - 1) activeRef.current = list.length - 1;
    list.forEach((item, i) => {
      const tabIndex = i === activeRef.current ? 0 : -1;
      const target = focusTargetOf(item);
      if (target) target.tabIndex = tabIndex;
      item
        .querySelectorAll<HTMLElement>("a[href], button")
        .forEach((el) => (el.tabIndex = tabIndex));
    });
  }, [items]);

  // Every render: a tab switch (Top 10, Discover) swaps the children, and the
  // new items need their tabindex before anyone presses Tab.
  useEffect(() => {
    applyRoving();
  });

  const measure = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    const prev = t.scrollLeft > 4;
    const next = t.scrollLeft + t.clientWidth < t.scrollWidth - 4;
    setEdges((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
  }, []);

  // A new list starts at its first item, not wherever the old one was left.
  useEffect(() => {
    if (resetKey === undefined) return;
    activeRef.current = 0;
    const t = trackRef.current;
    if (t) t.scrollLeft = 0;
  }, [resetKey]);

  useEffect(() => {
    const t = trackRef.current;
    if (!t) return;
    measure();
    t.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(t);
    return () => {
      t.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure]);

  function indexOfTarget(target: EventTarget | null): number {
    if (!(target instanceof Node)) return -1;
    return items().findIndex((item) => item.contains(target));
  }

  function onFocus(e: FocusEvent<HTMLDivElement>) {
    const i = indexOfTarget(e.target);
    if (i < 0 || i === activeRef.current) return;
    activeRef.current = i;
    applyRoving();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const list = items();
    const from = indexOfTarget(e.target);
    if (from < 0) return;
    const to = nextRowIndex(e.key, from, list.length);
    if (to === null) return;
    e.preventDefault();
    if (to === from) return;
    activeRef.current = to;
    applyRoving();
    const item = list[to]!;
    focusTargetOf(item)?.focus({ preventScroll: true });
    item.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function page(dir: 1 | -1) {
    const t = trackRef.current;
    const list = items();
    if (!t || list.length === 0) return;
    // Page by whole cards: the stride is one card plus the gap.
    const stride =
      list.length > 1
        ? list[1]!.offsetLeft - list[0]!.offsetLeft
        : list[0]!.offsetWidth;
    const style = getComputedStyle(t);
    const inner =
      t.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const perPage = Math.max(1, Math.floor(inner / Math.max(stride, 1)));
    t.scrollBy({
      left: dir * perPage * stride,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn("browse-row group/row relative", className)}
    >
      <div
        className={cn(
          "row-gutter flex flex-wrap items-end justify-between gap-x-3 gap-y-2",
          hideHeader && "sr-only",
        )}
      >
        <div className="min-w-0">
          {eyebrow ? (
            <p className="truncate text-xs font-medium text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={headingId}
            className="truncate text-lg font-semibold leading-7 tracking-tight sm:text-xl"
          >
            {href ? (
              <Link
                href={href}
                className="group/see inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {title}
                <span className="inline-flex items-center text-sm font-medium text-primary opacity-0 transition-opacity group-hover/see:opacity-100 group-focus-visible/see:opacity-100">
                  See all
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            ) : (
              title
            )}
          </h2>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          role="list"
          data-row-track
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          className={cn(
            "row-gutter flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain py-6 sm:gap-4",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            trackClassName,
          )}
        >
          {children}
        </div>

        <Paddle dir={-1} show={edges.prev} onClick={() => page(-1)} />
        <Paddle dir={1} show={edges.next} onClick={() => page(1)} />
      </div>
    </section>
  );
}

/**
 * Edge paddle. Mouse-only by design (`tabIndex=-1`): keyboard users already
 * move through the row with the arrow keys, and a focusable paddle at each end
 * of every row would add sixteen meaningless tab stops to the page.
 */
function Paddle({
  dir,
  show,
  onClick,
}: {
  dir: 1 | -1;
  show: boolean;
  onClick: () => void;
}) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={dir === 1 ? "Scroll right" : "Scroll left"}
      onClick={onClick}
      className={cn(
        "row-paddle absolute inset-y-0 z-30 hidden items-center",
        dir === 1 ? "right-0 justify-end bg-gradient-to-l" : "left-0 justify-start bg-gradient-to-r",
        "from-background via-background/70 to-transparent",
        "opacity-0 transition-opacity duration-200 group-hover/row:opacity-100",
        show && "pointer-fine:flex",
      )}
    >
      <span className="mx-2 grid size-10 place-items-center rounded-full bg-background/90 text-foreground shadow-md ring-1 ring-border transition-transform hover:scale-110">
        <Icon className="size-5" aria-hidden />
      </span>
    </button>
  );
}
