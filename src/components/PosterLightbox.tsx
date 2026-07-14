"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Click-to-zoom for detail-page posters: wraps the poster as a button; opening
 * shows the full image in a fixed overlay (click anywhere or Esc to close).
 * Images are globally unoptimized, so the overlay renders the source file at
 * its natural resolution.
 */
export function PosterLightbox({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: React.ReactNode;
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full poster for ${alt}`}
        className="block w-full cursor-zoom-in text-left"
      >
        {children}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Poster for ${alt}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close poster view"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-5" aria-hidden />
          </button>
          <Image
            src={src}
            alt={alt}
            width={720}
            height={1080}
            className="h-auto max-h-[92vh] w-auto max-w-[94vw] rounded-xl shadow-2xl ring-1 ring-white/15"
          />
        </div>
      ) : null}
    </>
  );
}
