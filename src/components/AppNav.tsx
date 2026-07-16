"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { SiteBanner } from "@/components/SiteBanner";
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
import { useUser } from "@/hooks/use-user";
import { NAV_ITEMS } from "@/lib/nav-items";
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

  return (
    <header className="glass sticky top-0 z-40 w-full border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        {/* Options button — reveals the nav drawer (hidden by default). */}
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

        {/* Logo / brand banner */}
        <Link
          href="/"
          aria-label="anime_maniacs"
          className="flex shrink-0 items-center"
        >
          <SiteBanner />
        </Link>

        {/* Right side — account */}
        <div className="ml-auto flex items-center gap-1">
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
              {isAdminUser ? (
                <DropdownMenuItem
                  onClick={() => router.push("/admin")}
                  className="text-amber-400 data-[highlighted]:text-amber-300"
                >
                  🛡 Admin dashboard
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Change username
              </DropdownMenuItem>
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
              initial={{ x: reduce ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="glass fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-border p-4"
              aria-label="Primary navigation"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Browse
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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
