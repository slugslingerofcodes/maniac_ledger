"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Library", href: "/library" },
  { label: "Search", href: "/search" },
  { label: "Upcoming", href: "/upcoming" },
  { label: "Recommendations", href: "/recommendations" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-zinc-950/80 text-zinc-50 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span aria-hidden className="text-indigo-400">
            ▶
          </span>
          AniTrack
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user?.email ? (
            <span className="hidden text-sm text-zinc-400 sm:inline">
              {user.email}
            </span>
          ) : null}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
