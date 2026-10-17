"use client";

import { BookOpen } from "lucide-react";

import { FrameworkNav, type FrameworkNavConfig } from "@/components/FrameworkNav";
import { NAV_SECTIONS } from "@/lib/nav-items";
import type { NavUser } from "@/lib/nav-user";

/**
 * The anime framework's header. All of the chrome lives in `FrameworkNav`,
 * which the manga side renders too — see that file for why the two headers
 * share one component rather than two implementations that agree by hand.
 */
const CONFIG: FrameworkNavConfig = {
  homeHref: "/",
  homeLabel: "anime_maniacs",
  sections: NAV_SECTIONS,
  search: { kind: "palette", placeholder: "Search anime…" },
  crossLink: { href: "/manga", label: "Manga", Icon: BookOpen },
};

/** `user` comes from the layout, un-awaited — see `getNavUser`. */
export function AppNav({ user }: { user: Promise<NavUser | null> }) {
  return <FrameworkNav config={CONFIG} user={user} />;
}
