"use client";

import { searchMangaAction } from "@/app/actions/manga";
import { MangaBrowse } from "@/components/manga/MangaBrowse";

/** Dedicated light-novel tab: search + genre filters, pinned to MAL's
 * lightnovel type (AniList format NOVEL on fallback). */
export default function LightNovelsPage() {
  return (
    <MangaBrowse
      title="Light Novels"
      subtitle="Search and track light novels — separate from the comic tabs."
      tabs={[
        {
          key: "lightnovel",
          label: "Light Novels",
          run: (q, p, g) => searchMangaAction(q, p, "lightnovel", g),
        },
      ]}
    />
  );
}
