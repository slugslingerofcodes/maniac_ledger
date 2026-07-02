"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Calendar, Newspaper, Search, User } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Library", href: "/library", Icon: Bookmark },
  { label: "Search", href: "/search", Icon: Search },
  { label: "Upcoming", href: "/upcoming", Icon: Calendar },
  { label: "News", href: "/news", Icon: Newspaper },
  { label: "Profile", href: "/profile", Icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Mobile bottom tab bar (hidden at md+). Fixed to the bottom with safe-area
 * padding; the active tab uses the indigo accent. Each tab is a >=44px target.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ label, href, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium [touch-action:manipulation] transition-colors",
                  active
                    ? "text-indigo-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
