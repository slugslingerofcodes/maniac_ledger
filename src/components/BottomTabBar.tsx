"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { Bookmark, House, Search, Sparkles, User } from "lucide-react";

import { LinkPending } from "@/components/LinkPending";
import { loadDomMax } from "@/lib/lazy-motion";
import { cn } from "@/lib/utils";

// Five is the ceiling for a thumb-reachable bar; Upcoming and News stay one
// tap away in the nav drawer.
const TABS = [
  { label: "Home", href: "/", Icon: House },
  { label: "Cosmos", href: "/cosmos", Icon: Sparkles },
  { label: "Library", href: "/library", Icon: Bookmark },
  { label: "Search", href: "/search", Icon: Search },
  { label: "Profile", href: "/profile", Icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Mobile bottom tab bar (hidden at md+). Fixed to the bottom with safe-area
 * padding; a shared layoutId pill slides to the active tab. Each tab is a
 * >=44px target.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    // `m` + lazily-loaded features instead of `motion`: this bar is mounted on
    // every route, so framer's full bundle here was first-load JS everywhere.
    // domMax because the pill's `layoutId` slide is a layout animation.
    // `strict` makes a stray `motion.*` in here throw instead of silently
    // pulling the full bundle back in.
    <LazyMotion features={loadDomMax} strict>
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
                    "relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium [touch-action:manipulation] transition-colors active:translate-y-px",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="relative flex items-center justify-center rounded-full px-4 py-1">
                    {active ? (
                      <m.span
                        layoutId="bottom-tab-pill"
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 400, damping: 32 }
                        }
                        className="absolute inset-0 rounded-full bg-primary/15"
                      />
                    ) : null}
                    <Icon className="relative size-5" aria-hidden />
                  </span>
                  {label}
                  {/* Corner-pinned so a thumb bar never reflows mid-tap. */}
                  <LinkPending className="absolute right-2 top-1.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </LazyMotion>
  );
}
