"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Library", href: "/library" },
  { label: "Search", href: "/search" },
  { label: "Upcoming", href: "/upcoming" },
  { label: "Recommendations", href: "/recommendations" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const email = user?.email ?? "";
  const name = getDisplayName(user);
  const initial = name && name !== "Account" ? name[0]!.toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        {/* Logo / wordmark */}
        <Link href="/library" aria-label="anime_maniacs" className="flex items-center">
          <Image
            src="/wordmark.png"
            alt="anime_maniacs"
            width={5132}
            height={832}
            priority
            sizes="250px"
            className="h-9 w-auto"
          />
        </Link>

        {/* Center links (desktop) */}
        <nav className="ml-6 hidden items-center gap-1 md:flex">
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
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1">
          {/* Avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Avatar>
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate font-medium text-foreground">
                  {name}
                </span>
                {email ? (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {email}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle>Menu</SheetTitle>
              <nav className="mt-2 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SheetClose
                      key={item.href}
                      render={
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            active
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      }
                    />
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-border pt-4">
                {user ? (
                  <div className="mb-2 px-3">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {email ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {email}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
