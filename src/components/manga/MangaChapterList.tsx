"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChapterListItem = {
  number: number;
  title: string | null;
  publishedAt: string | null;
};

/** Chapter number label — trims float noise like 10.100000000000001. */
function chapterLabel(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * The chapter list on the manga detail page — collapsible, newest-first
 * toggle, scrollable so 1000-chapter series don't swallow the page. Data comes
 * from the shared `manga_chapters` catalog (synced from MangaDex). Light
 * novels pass `unit="volume"` and a generated volume list instead (there is
 * no chapter source for prose).
 */
export function MangaChapterList({
  chapters,
  chaptersRead,
  unit = "chapter",
}: {
  chapters: ChapterListItem[];
  chaptersRead: number;
  unit?: "chapter" | "volume";
}) {
  const [open, setOpen] = useState(true);
  const [newestFirst, setNewestFirst] = useState(true);

  if (chapters.length === 0) return null;

  const ordered = newestFirst ? [...chapters].reverse() : chapters;
  const latest = chapters[chapters.length - 1]!;
  const heading = unit === "volume" ? "Volumes" : "Chapters";
  const abbrev = unit === "volume" ? "vol" : "ch";

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open ? "" : "-rotate-90")}
            aria-hidden
          />
          {heading}
          <span className="text-sm font-normal text-muted-foreground">
            {chapters.length} · latest {abbrev} {chapterLabel(latest.number)}
          </span>
        </button>
        {open ? (
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {newestFirst ? "Newest first ↓" : "Oldest first ↑"}
          </button>
        ) : null}
      </div>

      {open ? (
        <ol className="scrollbar-subtle mt-3 max-h-96 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border bg-card/60">
          {ordered.map((c) => {
            const read = c.number <= chaptersRead;
            return (
              <li
                key={c.number}
                className="flex items-baseline gap-3 px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    "w-14 shrink-0 font-mono text-xs tabular-nums",
                    read ? "text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {read ? "✓ " : ""}
                  {chapterLabel(c.number)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    read ? "text-muted-foreground" : "text-foreground",
                  )}
                  title={c.title ?? undefined}
                >
                  {c.title ?? "—"}
                </span>
                {c.publishedAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.publishedAt}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
