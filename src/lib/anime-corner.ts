import { BarChart3, Database, Newspaper, Scale, type LucideIcon } from "lucide-react";

/**
 * Anime Corner (animecorner.me) — the outside coverage the app links out to.
 *
 * These are **links, not a feed**. The app doesn't fetch, cache, mirror or
 * reproduce anything from Anime Corner: their articles, database entries and
 * poll results are theirs, and copying them into our pages would be both a
 * licensing problem and a maintenance one (their markup is not an API). Every
 * destination here opens in a new tab on their own site, which is also what
 * keeps this honest for their traffic.
 *
 * One list, two consumers: the drawer nav (`nav-items.ts`) and the Community
 * hub (`/community`). A URL that moves gets corrected in one place — worth it,
 * because a dead external link is invisible from inside the app.
 */
export type AnimeCornerLink = {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** One line on what's actually over there, for the drawer hint and the card. */
  blurb: string;
};

export const ANIME_CORNER_HOME = "https://animecorner.me/";

export const ANIME_CORNER_LINKS: readonly AnimeCornerLink[] = [
  {
    label: "News",
    href: ANIME_CORNER_HOME,
    Icon: Newspaper,
    blurb: "Industry news and features, straight from Japan.",
  },
  {
    label: "Database",
    href: "https://animecorner.me/db/",
    Icon: Database,
    blurb: "Series entries, staff and studio credits, release calendar.",
  },
  {
    label: "Polls",
    href: "https://animecorner.me/polls/",
    Icon: BarChart3,
    blurb: "Anime of the Week and the seasonal community rankings.",
  },
  {
    label: "Compare Anime",
    href: "https://animecorner.me/polls/rankings/anime-of-the-week/compare",
    Icon: Scale,
    blurb: "Put two shows side by side and see how the vote split.",
  },
];
