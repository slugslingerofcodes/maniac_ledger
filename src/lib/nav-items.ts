import {
  Bookmark,
  CalendarDays,
  Clapperboard,
  Clock,
  Compass,
  Film,
  House,
  LayoutList,
  Leaf,
  ListChecks,
  Music,
  Newspaper,
  Rss,
  Search,
  Shapes,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for the anime side's authed navigation. Rendered by
 * `AppNav`'s drawer and by `BottomTabBar` (mobile), both mounted once in the
 * (app) layout — so a route added here is reachable from every authed page.
 * (The manga side has its own list in `MangaNav`.)
 *
 * Grouped rather than flat: eighteen unlabelled links in one column read as
 * alphabet soup, and the pages nobody guessed existed (`/songs`, `/store`,
 * `/news`) were the ones buried mid-list. The sections answer "what am I trying
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
        label: "News",
        href: "/news",
        Icon: Newspaper,
        hint: "The community broadsheet",
      },
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
