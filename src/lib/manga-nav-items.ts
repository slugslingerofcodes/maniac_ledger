import {
  Bookmark,
  Clapperboard,
  Globe,
  House,
  Images,
  Newspaper,
  NotebookText,
  Palette,
  Search,
  Shapes,
} from "lucide-react";

import type { NavSection } from "@/lib/nav-items";

/**
 * The manga framework's navigation — the counterpart to `NAV_SECTIONS` in
 * `nav-items.ts`, and deliberately the same shape so both sides can render
 * through one component (`FrameworkNav`).
 *
 * These used to be nine undifferentiated links scrolling sideways in the
 * header, which is how "Arts", "Posters" and "Miscellaneous" ended up
 * indistinguishable from each other: the row said what each page was called
 * and nothing about what it was for. The groups answer the same question the
 * anime side's do — what am I trying to do right now — and the hints carry the
 * distinction the labels can't.
 */
export const MANGA_NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Reading",
    items: [
      // `exact`: /manga is a prefix of every other row here, so without it the
      // Home row would light up on all of them.
      {
        label: "Home",
        href: "/manga",
        Icon: House,
        hint: "Your reading dashboard",
        exact: true,
      },
      {
        label: "Library",
        href: "/manga/library",
        Icon: Bookmark,
        hint: "Everything you track",
      },
    ],
  },
  {
    title: "Discover",
    items: [
      {
        label: "Search",
        href: "/manga/search",
        Icon: Search,
        hint: "Find any series",
      },
      {
        label: "Light Novels",
        href: "/manga/lightnovels",
        Icon: NotebookText,
        hint: "Prose, not panels",
      },
      { label: "Web", href: "/manga/web", Icon: Globe, hint: "Webtoons and web manga" },
      {
        label: "Miscellaneous",
        href: "/manga/miscellaneous",
        Icon: Shapes,
        hint: "One-shots, doujin, everything else",
      },
    ],
  },
  {
    title: "Keeping up",
    items: [
      {
        label: "News",
        href: "/manga/news",
        Icon: Newspaper,
        hint: "The Manga Times",
      },
    ],
  },
  {
    title: "Gallery",
    items: [
      { label: "Arts", href: "/manga/arts", Icon: Palette, hint: "Cover artwork" },
      {
        label: "Posters",
        href: "/manga/posters",
        Icon: Images,
        hint: "The poster wall",
      },
    ],
  },
  {
    title: "More",
    items: [
      {
        label: "Anime →",
        href: "/",
        Icon: Clapperboard,
        hint: "Switch to the watching side",
        exact: true,
      },
    ],
  },
];
