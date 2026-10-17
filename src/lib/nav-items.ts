import {
  Bookmark,
  CalendarDays,
  Clapperboard,
  Clock,
  Compass,
  Film,
  Globe,
  House,
  LayoutList,
  Leaf,
  ListChecks,
  Music,
  Rss,
  Search,
  Shapes,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ANIME_CORNER_LINKS } from "@/lib/anime-corner";

/**
 * The single source of truth for the anime side's authed navigation. Rendered by
 * `AppNav`'s drawer and by `BottomTabBar` (mobile), both mounted once in the
 * (app) layout — so a route added here is reachable from every authed page.
 * (The manga side has its own list in `MangaNav`.)
 *
 * Grouped rather than flat: eighteen unlabelled links in one column read as
 * alphabet soup, and the pages nobody guessed existed (`/songs`, `/store`,
 * `/community`) were the ones buried mid-list. The sections answer "what am I trying
 * to do?" — track, find, follow — and the icons give each row a shape to aim
 * for. `NAV_ITEMS` stays exported flat because the command palette wants one
 * list, not four.
 */
export type NavItem = {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** One-line hint shown under the label in the drawer. */
  hint?: string;
  /**
   * Off-site destination: rendered as a plain anchor opening in a new tab, and
   * never a `<Link>`. Consumers must branch on this — `next/link` and the
   * command palette's `router.push` both assume an in-app route, and an
   * absolute URL through either one is a broken navigation rather than a
   * visible error. External items never take the active state either, since
   * the app's pathname can't match them.
   */
  external?: boolean;
  /**
   * Take the active state on an exact pathname match only, never on a prefix.
   *
   * Needed by any "home" row whose href is a prefix of its whole section:
   * `/manga` is the parent of `/manga/news`, `/manga/library` and the rest, so
   * without this the manga Home row highlights on every manga page at once.
   * The anime side's `/` doesn't need it — the prefix test appends a slash, and
   * nothing matches `//`.
   */
  exact?: boolean;
};

export type NavSection = {
  title: string;
  items: readonly NavItem[];
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Watching",
    items: [
      // "/" never matches the `href + "/"` active-state prefix test, so Home
      // highlights on the home page alone rather than on every route.
      { label: "Home", href: "/", Icon: House, hint: "Your dashboard" },
      {
        label: "Library",
        href: "/library",
        Icon: Bookmark,
        hint: "Everything you track",
      },
      {
        label: "Cosmos ✦",
        href: "/cosmos",
        Icon: Sparkles,
        hint: "Your collection as a galaxy",
      },
      {
        label: "My Progress",
        href: "/progress",
        Icon: TrendingUp,
        hint: "Stats and milestones",
      },
      { label: "Lists", href: "/lists", Icon: ListChecks, hint: "Custom lists" },
    ],
  },
  {
    title: "Discover",
    items: [
      { label: "Search", href: "/search", Icon: Search, hint: "Find anything" },
      {
        label: "Recommendations",
        href: "/recommendations",
        Icon: Compass,
        hint: "Picked for you",
      },
      { label: "Seasons", href: "/seasons", Icon: Leaf, hint: "Season by season" },
      {
        label: "Upcoming",
        href: "/upcoming",
        Icon: Clock,
        hint: "Not out yet",
      },
      { label: "Movies", href: "/movies", Icon: Film, hint: "Feature length" },
      {
        label: "Miscellaneous",
        href: "/miscellaneous",
        Icon: Shapes,
        hint: "OVAs, specials, ONAs",
      },
    ],
  },
  {
    title: "Keeping up",
    items: [
      {
        label: "Schedule",
        href: "/schedule",
        Icon: CalendarDays,
        hint: "What airs when",
      },
      { label: "Feed", href: "/feed", Icon: Rss, hint: "Friend activity" },
      { label: "Friends", href: "/friends", Icon: Users, hint: "People you follow" },
    ],
  },
  {
    // News used to be an in-app broadsheet built from r/anime hot posts. It now
    // points at Anime Corner, so it sits with the rest of the off-site coverage
    // rather than alone under "Keeping up" — the whole section is one trip
    // outside the app, and grouping it says so before the click does.
    title: "Community",
    items: [
      {
        label: "Community",
        href: "/community",
        Icon: Globe,
        hint: "Anime Corner, feed and friends",
      },
      ...ANIME_CORNER_LINKS.map(
        (link): NavItem => ({
          label: link.label,
          href: link.href,
          Icon: link.Icon,
          hint: link.blurb,
          external: true,
        }),
      ),
    ],
  },
  {
    title: "More",
    items: [
      { label: "Songs", href: "/songs", Icon: Music, hint: "Openings and endings" },
      { label: "Store", href: "/store", Icon: ShoppingBag, hint: "Merch requests" },
      {
        label: "Manga →",
        href: "/manga",
        Icon: LayoutList,
        hint: "Switch to the reading side",
      },
    ],
  },
] as const;

/** Every nav destination, flattened — for the command palette and tests. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items,
);

/** Icon for the app-wide "browse anime" affordance, re-exported for reuse. */
export { Clapperboard };
