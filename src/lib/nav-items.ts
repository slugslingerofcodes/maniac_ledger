/**
 * The single source of truth for the anime side's authed navigation. Both navs
 * render this list — `AppNav` (the (app) group's drawer) and `SiteHeader` (the
 * older header on routes outside the group) — so a new route added here is
 * reachable from every page. Previously each nav kept its own copy and they
 * had to be edited in lockstep.
 */
export const NAV_ITEMS = [
  { label: "Library", href: "/library" },
  { label: "My Progress", href: "/progress" },
  { label: "Search", href: "/search" },
  { label: "Miscellaneous", href: "/miscellaneous" },
  { label: "Schedule", href: "/schedule" },
  { label: "Seasons", href: "/seasons" },
  { label: "Upcoming", href: "/upcoming" },
  { label: "Movies", href: "/movies" },
  { label: "Lists", href: "/lists" },
  { label: "Friends", href: "/friends" },
  { label: "Feed", href: "/feed" },
  { label: "Store", href: "/store" },
  { label: "News", href: "/news" },
  { label: "Songs", href: "/songs" },
  { label: "Recommendations", href: "/recommendations" },
  { label: "Manga →", href: "/manga" },
] as const;
