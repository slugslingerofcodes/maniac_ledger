"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

import { PosterFallback } from "@/components/poster-fallback";
import { cn } from "@/lib/utils";
import { ROW_FOCUS_ATTR, ROW_ITEM_ATTR } from "./row-nav";

/** Poster card widths per breakpoint — ~2.6 cards visible on a phone, ~6.5 on desktop. */
export const POSTER_CARD_WIDTH = "w-32 sm:w-36 md:w-40 lg:w-44 xl:w-48";
/** `sizes` matching {@link POSTER_CARD_WIDTH}, so the loader picks the right rendition. */
export const POSTER_CARD_SIZES =
  "(min-width: 1280px) 192px, (min-width: 1024px) 176px, (min-width: 768px) 160px, (min-width: 640px) 144px, 128px";

/** Landscape (16:9) card widths — Continue Watching. */
export const LANDSCAPE_CARD_WIDTH = "w-64 sm:w-72 lg:w-80";
export const LANDSCAPE_CARD_SIZES = "(min-width: 1024px) 320px, (min-width: 640px) 288px, 256px";

/**
 * Pick which way a card grows, so the expansion never spills past the row's
 * visible edge (where `overflow-x: auto` would clip it). Cards in the middle
 * grow from the centre; the first and last visible ones grow inward.
 */
function aim(e: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) {
  const card = e.currentTarget;
  const track = card.closest<HTMLElement>("[data-row-track]");
  if (!track) return;
  const c = card.getBoundingClientRect();
  const t = track.getBoundingClientRect();
  const room = c.width * 0.1;
  const origin =
    c.left - t.left < room ? "left" : t.right - c.right < room ? "right" : "center";
  card.style.setProperty("--lift-origin", origin);
}

/**
 * The browse card shell: a poster that links to the title and, on desktop
 * hover or keyboard focus, lifts in place to show `panel` (details) and
 * `actions` (quick buttons).
 *
 * Why it can't shift layout: the slot keeps its size and only the inner
 * `.browse-card-lift` scales — a transform, so neighbours never move. The rest
 * lives in globals.css (`.browse-card*`): the hover delay that stops a mouse
 * sweeping across a row from popping every card, the focus-visible variant for
 * keyboards, and the reduced-motion fallback (the panel still appears, nothing
 * scales).
 *
 * The panel sits over the poster but is `pointer-events: none`, so clicking
 * anywhere that isn't a button still opens the title; the buttons are siblings
 * of the link, never inside it — an interactive control nested in an anchor is
 * invalid and swallows taps.
 */
export function ExpandingCard({
  href,
  title,
  label,
  posterUrl,
  sizes = POSTER_CARD_SIZES,
  widthClassName = POSTER_CARD_WIDTH,
  aspect = "poster",
  eager = false,
  objectPosition,
  overlay,
  controls,
  panel,
  actions,
  caption,
  leading,
  className,
}: {
  href: string;
  /** The title — the link's accessible name unless `label` overrides it. */
  title: string;
  /** Accessible name when it should say more than the title ("#1 Frieren"). */
  label?: string;
  posterUrl: string | null;
  sizes?: string;
  widthClassName?: string;
  aspect?: "poster" | "landscape";
  /** Above-the-fold posters: skip lazy loading. */
  eager?: boolean;
  objectPosition?: string;
  /** Always-visible layers on the artwork (badges, progress, status edge). */
  overlay?: ReactNode;
  /**
   * Always-present buttons over the artwork, positioned by the caller (the
   * Continue Watching "+1"). Rendered beside the link, never inside it.
   */
  controls?: ReactNode;
  /** Expanded-state details (non-interactive). */
  panel?: ReactNode;
  /** Expanded-state buttons. */
  actions?: ReactNode;
  /** Text under the artwork at rest. */
  caption?: ReactNode;
  /** Content before the artwork inside the slot (the Top 10 numeral). */
  leading?: ReactNode;
  className?: string;
}) {
  const expandable = panel != null || actions != null;
  // A poster that fails to load (a CDN blip, a dead catalog URL) becomes the
  // title-initial placeholder instead of a broken-image icon mid-row.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPoster = posterUrl != null && failedSrc !== posterUrl;
  return (
    <div
      {...{ [ROW_ITEM_ATTR]: "" }}
      role="listitem"
      onPointerEnter={expandable ? aim : undefined}
      onFocus={expandable ? aim : undefined}
      className={cn(
        "relative shrink-0 snap-start",
        expandable && "browse-card",
        widthClassName,
        className,
      )}
    >
      {leading}
      <div className="browse-card-lift relative rounded-lg">
        <Link
          href={href}
          aria-label={label ?? title}
          {...{ [ROW_FOCUS_ATTR]: "" }}
          className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div
            className={cn(
              "foil relative w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10",
              aspect === "poster" ? "aspect-[2/3]" : "aspect-video",
            )}
          >
            {showPoster ? (
              // Raw URL: the custom loader picks the rendition per srcSet
              // width, so the card is crisp at 2× and cheap at 1×.
              <Image
                src={posterUrl}
                alt=""
                fill
                sizes={sizes}
                loading={eager ? "eager" : "lazy"}
                onError={() => setFailedSrc(posterUrl)}
                className="object-cover"
                style={objectPosition ? { objectPosition } : undefined}
              />
            ) : (
              <PosterFallback title={title} />
            )}
            {overlay}
          </div>
        </Link>

        {expandable ? (
          <div className="browse-card-panel pointer-events-none absolute inset-0 flex flex-col justify-end overflow-hidden rounded-lg p-2.5 text-banner-foreground">
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-banner from-25% via-banner/80 via-55% to-transparent"
            />
            {panel ? <div className="relative">{panel}</div> : null}
            {actions ? (
              <div className="pointer-events-auto relative mt-2 flex flex-wrap gap-1.5">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
        {controls}
      </div>
      {caption}
    </div>
  );
}

/** Title + meta line under a poster at rest; fixed height so skeletons match. */
export function CardCaption({
  title,
  meta,
}: {
  title: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mt-2 h-9 min-w-0">
      <p className="truncate text-[13px] font-medium leading-5">{title}</p>
      {meta ? (
        <p className="truncate text-[11px] leading-4 text-muted-foreground">{meta}</p>
      ) : null}
    </div>
  );
}

/** Small pill button used in card panels and the banner. */
export function PanelButton({
  children,
  onClick,
  disabled,
  pressed,
  primary,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-banner",
        "disabled:cursor-default",
        primary
          ? "bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-70"
          : "bg-banner-foreground/15 text-banner-foreground ring-1 ring-banner-foreground/25 hover:bg-banner-foreground/25",
        pressed && "bg-gold text-banner ring-0 hover:bg-gold",
      )}
    >
      {children}
    </button>
  );
}
