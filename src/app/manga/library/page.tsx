"use client";

import { useState } from "react";

import {
  MangaLibraryGridClient,
  type MangaFormatFilter,
} from "@/components/manga/MangaLibraryGridClient";
import { cn } from "@/lib/utils";
import { READING_STATUS_META, READING_STATUSES, type ReadingStatus } from "@/types/manga";

const TABS: { value: "all" | ReadingStatus; label: string }[] = [
  { value: "all", label: "All" },
  ...READING_STATUSES.map((s) => ({
    value: s,
    label: READING_STATUS_META[s].label,
  })),
];

const FORMAT_TABS: { value: MangaFormatFilter; label: string }[] = [
  { value: "all", label: "All formats" },
  { value: "Manga", label: "Manga" },
  { value: "Manhwa", label: "Manhwa" },
  { value: "Manhua", label: "Manhua" },
  { value: "Light Novel", label: "Light Novels" },
];

export default function MangaLibraryPage() {
  const [filter, setFilter] = useState<"all" | ReadingStatus>("all");
  const [format, setFormat] = useState<MangaFormatFilter>("all");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-4 text-2xl font-semibold tracking-tight">
        Your manga
      </h1>

      {/* Reading-status tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={filter === tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Format tabs: Manga / Manhwa / Manhua */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {FORMAT_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={format === tab.value}
            onClick={() => setFormat(tab.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              format === tab.value
                ? "bg-primary/80 text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <MangaLibraryGridClient filter={filter} format={format} />
    </main>
  );
}
