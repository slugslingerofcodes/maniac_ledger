"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clapperboard } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/manga" },
  { label: "Search", href: "/manga/search" },
  { label: "Library", href: "/manga/library" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/manga") return pathname === "/manga";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Header for the manga framework — the manga-side equivalent of AppNav. Kept
 * deliberately simple (a handful of links). The right-hand pill switches back to
 * the anime side, satisfying the "shift between frameworks" requirement.
 */
export function MangaNav() {
  const pathname = usePathname();

  return (
    <header className="glass sticky top-0 z-40 w-full border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/manga" className="flex items-center gap-2 font-semibold">
          <BookOpen className="size-5 text-primary" aria-hidden />
          <span className="tracking-tight">manga_maniacs</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Clapperboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">Anime</span>
          </Link>
          <Link
            href="/profile"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Profile
          </Link>
        </div>
      </div>
    </header>
  );
}
