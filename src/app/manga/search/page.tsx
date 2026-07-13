"use client";

import { MangaBrowse } from "@/components/manga/MangaBrowse";

/** Comic search: Manga / Manhwa / Manhua tabs, each with search + genre
 * filters. Light novels have their own tab at /manga/lightnovels. */
export default function MangaSearchPage() {
  return (
    <MangaBrowse
      title="Search"
      formats={[
        { value: "manga", label: "Manga" },
        { value: "manhwa", label: "Manhwa" },
        { value: "manhua", label: "Manhua" },
      ]}
    />
  );
}
