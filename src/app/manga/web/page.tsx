"use client";

import { searchMangaAction, searchWebComicsAction } from "@/app/actions/manga";
import { MangaBrowse } from "@/components/manga/MangaBrowse";

/**
 * Web-native serials: webcomics (MangaDex "Web Comic" titles — webtoons and
 * other web-first comics, including many with no MAL entry) and webnovels
 * (online-serialized prose, served by the novel pipeline). Each sub-tab has
 * its own search bar + genre filters.
 */
export default function WebPage() {
  return (
    <MangaBrowse
      title="Webcomics & Webnovels"
      subtitle="Web-first comics and novels — search by title or filter by genre."
      tabs={[
        {
          key: "webcomics",
          label: "Webcomics",
          run: (q, p, g) => searchWebComicsAction(q, p, g),
        },
        {
          key: "webnovels",
          label: "Webnovels",
          run: (q, p, g) => searchMangaAction(q, p, "lightnovel", g),
        },
      ]}
    />
  );
}
