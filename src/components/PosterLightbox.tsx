"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Tilt3D } from "@/components/Tilt3D";
import { cn } from "@/lib/utils";

/**
 * Click-to-zoom for detail-page posters: wraps the poster as a button; opening
 * shows the full image in a fixed overlay (click anywhere or Esc to close).
 * The custom image loader serves the CDN's largest rendition for the 720px
 * request, so the zoomed poster is the sharp one, not the card-sized one.
 *
 * The overlay is portalled to <body>. Rendered in place it inherited the
 * poster's ancestors: the detail hero is `isolate` (its own stacking context),
 * so `z-[70]` only ranked *inside* the hero — the Information panel below it
 * and the sticky header painted over the "full-screen" poster, which then
 * looked like a card stuck between the page's sections. Any ancestor with a
 * transform or filter would also re-anchor `position: fixed` to itself. From
 * <body> none of that can reach it.
 *
 * `round` swaps the poster card for a circular one (profile pictures): the
 * image is center-cropped square and clipped to a circle, and the holo
 * glare/tilt follow the circular edge.
 */
export function PosterLightbox({
  src,
  alt,
  children,
  round = false,
  triggerClassName,
}: {
  src: string;
  alt: string;
  children: React.ReactNode;
  round?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // A modal shouldn't let the page scroll away underneath it.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previousOverflow;
      // Hand focus back to the poster that opened it.
      trigger?.focus();
    };
  }, [open]);

  const shape = round ? "rounded-full" : "rounded-xl";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full ${round ? "profile picture" : "poster"} for ${alt}`}
        className={cn(
          "block w-full cursor-zoom-in text-left",
          triggerClassName,
        )}
      >
        {children}
      </button>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${round ? "Profile picture" : "Poster"} for ${alt}`}
              onClick={() => setOpen(false)}
              className="lightbox-backdrop fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            >
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <X className="size-5" aria-hidden />
              </button>
              {/* 3D inspect: the full-size image tilts under the pointer, like
                  turning the card in your hands. Clicks still bubble up to close. */}
              <div className="lightbox-card">
                <Tilt3D maxTilt={7} scale={1} shadow className={shape} glareClassName={shape}>
                  <Image
                    src={src}
                    alt={alt}
                    width={720}
                    height={round ? 720 : 1080}
                    // MangaDex covers 403 into a placeholder behind a foreign
                    // Referer; harmless for every other poster host.
                    referrerPolicy="no-referrer"
                    className={cn(
                      "shadow-2xl ring-1 ring-white/15",
                      shape,
                      round
                        ? "size-[min(80vmin,560px)] object-cover"
                        : "h-auto max-h-[92vh] w-auto max-w-[94vw]",
                    )}
                  />
                </Tilt3D>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
