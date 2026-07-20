"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Tilt3D } from "@/components/Tilt3D";
import { cn } from "@/lib/utils";

/**
 * Click-to-zoom for detail-page posters: wraps the poster as a button; opening
 * shows the full image in a fixed overlay (click anywhere or Esc to close).
 * Images are globally unoptimized, so the overlay renders the source file at
 * its natural resolution.
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shape = round ? "rounded-full" : "rounded-xl";

  return (
    <>
      <button
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

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${round ? "Profile picture" : "Poster"} for ${alt}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-5" aria-hidden />
          </button>
          {/* 3D inspect: the full-size image tilts under the pointer, like
              turning the card in your hands. Clicks still bubble up to close. */}
          <Tilt3D maxTilt={7} scale={1} shadow className={shape} glareClassName={shape}>
            <Image
              src={src}
              alt={alt}
              width={720}
              height={round ? 720 : 1080}
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
      ) : null}
    </>
  );
}
