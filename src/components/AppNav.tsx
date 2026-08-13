"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Menu, Search, X } from "lucide-react";

import { NotificationBell } from "@/components/NotificationBell";
import { SiteBanner } from "@/components/SiteBanner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useUser } from "@/hooks/use-user";
import { NAV_SECTIONS } from "@/lib/nav-items";
import { openCommandPalette } from "@/lib/command-palette";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduce = useReducedMotion();
  const drawerRef = useFocusTrap<HTMLElement>(drawerOpen);

  // Close the drawer whenever the route changes — state adjusted during
  // render (React's "derived state" pattern), not in an effect, so there's no
  // extra committed frame with the drawer still open on the new page.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setDrawerOpen(false);
  }

  // …and on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const email = user?.email ?? "";
  const name = getDisplayName(user);
  const initial = name && name !== "Account" ? name[0]!.toUpperCase() : "?";
  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;
  // Inline (not lib/supabase/auth's isAdmin) — that module is server-only.
  const isAdminUser = user?.app_metadata?.is_admin === true;
  const username =
    typeof user?.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";

  return (
    <header className="glass sticky top-0 z-40 w-full border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        {/* Options button — reveals the nav drawer (hidden by default). */}
        <Tooltip label="Browse every section">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-5" aria-hidden />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </Tooltip>

        {/* Logo / brand banner */}
        <Link
          href="/"
          aria-label="anime_maniacs"
          className="flex shrink-0 items-center"
        >
          <SiteBanner />
        </Link>

        {/*
          The command palette was the fastest thing in the app and nobody knew
          it existed — ⌘K appeared in exactly one code comment and nowhere in
          the UI. This is a button dressed as a search field: it costs a
          nav-bar slot and makes the whole feature discoverable by sight.
        */}
        <button
          type="button"
          onClick={() => openCommandPalette()}
          className="ml-auto hidden min-w-0 max-w-64 flex-1 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Search anime…</span>
          <kbd className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 font-sans text-[10px]">
            ⌘K
          </kbd>
        </button>

        {/* Right side — account */}
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {/* Mobile: the same palette, as an icon. */}
          <Tooltip label="Search">
            <button
              type="button"
              onClick={() => openCommandPalette()}
              aria-label="Search"
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            >
              <Search className="size-5" aria-hidden />
            </button>
          </Tooltip>

          {/* Mirrors the "Anime" pill MangaNav has always had, so the two
              frameworks switch symmetrically instead of the crossing being
              one-way from the header. */}
          <Link
            href="/manga"
            className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <BookOpen className="size-4" aria-hidden />
            <span className="hidden lg:inline">Manga</span>
          </Link>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {name && name !== "Account" ? (
                <span className="hidden max-w-32 truncate text-sm font-medium text-foreground sm:inline">
                  {name}
                </span>
              ) : null}
              <Avatar>
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
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
              {/* Theme lives in the account menu because that's where people
                  look for it; the row is a control, not a menu item, so it
                  doesn't close the menu on click. */}
              <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                <span className="text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
              <DropdownMenuSeparator />
              {isAdminUser ? (
                <DropdownMenuItem
                  onClick={() => router.push("/admin")}
                  className="text-amber-400 data-[highlighted]:text-amber-300"
                >
                  🛡 Admin dashboard
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Profile &amp; settings
              </DropdownMenuItem>
              {username ? (
                <DropdownMenuItem
                  onClick={() => router.push(`/users/${username}`)}
                >
                  View public profile
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Slide-out navigation drawer */}
      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />
            <motion.aside
              key="panel"
              ref={drawerRef}
              initial={{ x: reduce ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="glass fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col overflow-y-auto border-r border-border p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Primary navigation"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Browse
                </span>
                <Tooltip label="Close">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close navigation"
                    className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </Tooltip>
              </div>

              <nav className="flex flex-col gap-5">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                      {section.title}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {section.items.map((item) => {
                        const active = isActive(pathname, item.href);
                        const { Icon } = item;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "group/nav flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{item.label}</span>
                              {item.hint ? (
                                <span className="block truncate text-[11px] font-normal text-muted-foreground/70">
                                  {item.hint}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                <div className="mb-3 flex items-center justify-between px-3">
                  <span className="text-xs text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
                {isAdminUser ? (
                  <Link
                    href="/admin"
                    className="mb-2 block rounded-md px-3 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-muted hover:text-amber-300"
                  >
                    🛡 Admin dashboard
                  </Link>
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
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
