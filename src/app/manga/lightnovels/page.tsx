"use client";

import { MangaBrowse } from "@/components/manga/MangaBrowse";

/** Dedicated light-novel tab: search + genre filters, pinned to MAL's
 * lightnovel type (AniList format NOVEL on fallback). */
export default function LightNovelsPage() {
  return (
    <MangaBrowse
      title="Light Novels"
      subtitle="Search and track light novels — separate from the comic tabs."
      formats={[{ value: "lightnovel", label: "Light Novels" }]}
    />
  );
}
