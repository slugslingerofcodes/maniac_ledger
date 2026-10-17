"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, m, useReducedMotion } from "framer-motion";
import { BookOpen, Bookmark, Newspaper, Search, User } from "lucide-react";

import { LinkPending } from "@/components/LinkPending";
import { loadDomMax } from "@/lib/lazy-motion";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Home", href: "/manga", Icon: BookOpen },
  { label: "News", href: "/manga/news", Icon: Newspaper },
  { label: "Search", href: "/manga/search", Icon: Search },
  { label: "Library", href: "/manga/library", Icon: Bookmark },
  { label: "Profile", href: "/profile", Icon: User },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/manga") return pathname === "/manga";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Mobile bottom tab bar for the manga framework (hidden at md+) — mirrors the
 * anime side's BottomTabBar: fixed with safe-area padding, a shared layoutId
 * pill sliding to the active tab, ≥44px targets.
 */
export function MangaBottomTabBar() {
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
                        layoutId="manga-bottom-tab-pill"
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
