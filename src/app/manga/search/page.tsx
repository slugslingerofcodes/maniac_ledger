"use client";

import { searchMangaAction } from "@/app/actions/manga";
import { MangaBrowse } from "@/components/manga/MangaBrowse";

/** Comic search: Manga / Manhwa / Manhua tabs, each with search + genre
 * filters. Light novels and webcomics have their own tabs. */
export default function MangaSearchPage() {
  return (
    <MangaBrowse
      title="Search"
      tabs={[
        {
          key: "manga",
          label: "Manga",
          run: (q, p, g) => searchMangaAction(q, p, "manga", g),
        },
        {
          key: "manhwa",
          label: "Manhwa",
          run: (q, p, g) => searchMangaAction(q, p, "manhwa", g),
        },
        {
          key: "manhua",
          label: "Manhua",
          run: (q, p, g) => searchMangaAction(q, p, "manhua", g),
        },
      ]}
    />
  );
}
