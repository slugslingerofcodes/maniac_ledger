/**
 * The single source of truth for the anime side's authed navigation. Rendered by
 * `AppNav`'s drawer and by `BottomTabBar` (mobile), both mounted once in the
 * (app) layout — so a route added here is reachable from every authed page.
 * (The manga side has its own list in `MangaNav`.)
 */
export const NAV_ITEMS = [
  // "/" never matches the `href + "/"` active-state prefix test, so Home
  // highlights on the home page alone rather than on every route.
  { label: "Home", href: "/" },
  { label: "Library", href: "/library" },
  { label: "Cosmos ✦", href: "/cosmos" },
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
