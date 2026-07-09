"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { GENRE_OPTIONS } from "@/lib/genres";

/**
 * Horizontally scrollable genre pill row under the home hero. Each pill
 * deep-links to /search with that genre pre-selected; the arrow buttons
 * scroll the strip a viewport-ish chunk at a time.
 */
export function GenreRibbon() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollByChunk = (dir: 1 | -1) =>
    trackRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });

  return (
    <div className="pattern-seigaiha relative border-b border-border/60 py-3">
      <button
        type="button"
        onClick={() => scrollByChunk(-1)}
        aria-label="Scroll genres left"
        className="absolute left-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border transition hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <div
        ref={trackRef}
        className="mx-12 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GENRE_OPTIONS.map((g) => (
          <Link
            key={g.id}
            href={`/search?genres=${g.id}`}
            className="shrink-0 rounded-lg bg-card px-6 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border transition hover:text-foreground hover:ring-primary/40"
          >
            {g.name}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollByChunk(1)}
        aria-label="Scroll genres right"
        className="absolute right-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border transition hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
