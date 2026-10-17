"use client";

import { Clapperboard } from "lucide-react";

import { FrameworkNav, type FrameworkNavConfig } from "@/components/FrameworkNav";
import { MANGA_NAV_SECTIONS } from "@/lib/manga-nav-items";
import type { NavUser } from "@/lib/nav-user";

/**
 * The manga framework's header — now the same component the anime side uses,
 * with a manga config.
 *
 * It used to be its own implementation: nine flat links scrolling sideways in
 * the header, and none of the chrome the anime side had grown (the grouped
 * drawer, the search field, reminders, the account menu with the theme
 * control). Crossing between the two sides felt like crossing into a different
 * product, and every addition to the anime header had to be remembered here.
 *
 * The one deliberate asymmetry is search: ⌘K resolves *anime* titles, so a
 * manga header that opened it would be lying about what it searches. The pill
 * links to /manga/search instead and drops the ⌘K hint, since there is no
 * shortcut to advertise.
 */
const CONFIG: FrameworkNavConfig = {
  homeHref: "/manga",
  homeLabel: "manga_maniacs",
  sections: MANGA_NAV_SECTIONS,
  search: { kind: "link", href: "/manga/search", placeholder: "Search manga…" },
  crossLink: { href: "/", label: "Anime", Icon: Clapperboard },
};

/** `user` comes from the layout, un-awaited — see `getNavUser`. */
export function MangaNav({ user }: { user: Promise<NavUser | null> }) {
  return <FrameworkNav config={CONFIG} user={user} />;
}
