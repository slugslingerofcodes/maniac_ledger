"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion";
import { ExternalLink, Menu, Search, X, type LucideIcon } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { LinkPending } from "@/components/LinkPending";
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
import { openCommandPalette } from "@/lib/command-palette";
import { loadDomAnimation } from "@/lib/lazy-motion";
import type { NavItem, NavSection } from "@/lib/nav-items";
import type { NavUser } from "@/lib/nav-user";
import { cn } from "@/lib/utils";

/**
 * Everything that differs between the anime and manga headers. Everything not
 * in here is shared by construction rather than by discipline — which is the
 * point: the manga header used to be a separate 87-line component with a flat
 * scrolling link row, so it drifted out of step with the anime side every time
 * that one gained something (the drawer, the palette trigger, the account
 * menu, the notification bell). One component, two configs, no drift.
 */
export type FrameworkNavConfig = {
  /** Where the brand banner links, and its accessible name. */
  homeHref: string;
  homeLabel: string;
  /** Grouped drawer contents. */
  sections: readonly NavSection[];
  /**
   * The header's search affordance. `palette` opens the ⌘K command palette;
   * `link` navigates instead — used where the palette would lie about what it
   * searches (it resolves anime, so the manga header points at /manga/search).
   */
  search:
    | { kind: "palette"; placeholder: string }
    | { kind: "link"; href: string; placeholder: string };
  /** The pill that crosses to the other framework. */
  crossLink: { href: string; label: string; Icon: LucideIcon };
};

function isActive(pathname: string, item: NavItem) {
  if (item.external) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * The sticky application header shared by both frameworks: brand banner, a
 * slide-out drawer holding every section, the search affordance, the
 * cross-framework pill, reminders, and the account menu.
 */
export function FrameworkNav({
  config,
  user,
}: {
  config: FrameworkNavConfig;
  /**
   * The signed-in user, resolved on the server (see `getNavUser`) and passed
   * through un-awaited so the layout never holds a route for it. Read with
   * `use()` behind Suspense: only the account button waits, and the header
   * never constructs the browser Supabase client.
   */
  user: Promise<NavUser | null>;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduce = useReducedMotion();
  const drawerRef = useFocusTrap<HTMLElement>(drawerOpen);
  // The drawer portals to <body> (see below), which only exists in the browser.
  const canPortal = useSyncExternalStore(subscribeNever, isClient, isServer);

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

  // The `signOut` Server Action clears the auth cookies server-side,
  // revalidates the layout (so no cached page outlives the session) and
  // redirects to /login — the same path LogoutButton takes, and no browser
  // Supabase client (~62 KB gz) downloaded just to end a session.
  const [signingOut, startSignOut] = useTransition();
  function handleSignOut() {
    startSignOut(() => signOut());
  }

  const { Icon: CrossIcon } = config.crossLink;
  const searchPillClass =
    "ml-auto hidden min-w-0 max-w-64 flex-1 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex";

  return (
    <header className="glass sticky top-0 z-40 w-full border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
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
          href={config.homeHref}
          aria-label={config.homeLabel}
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
        {config.search.kind === "palette" ? (
          <button
            type="button"
            onClick={() => openCommandPalette()}
            className={searchPillClass}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{config.search.placeholder}</span>
            <kbd className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 font-sans text-[10px]">
              ⌘K
            </kbd>
          </button>
        ) : (
          <Link href={config.search.href} className={searchPillClass}>
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{config.search.placeholder}</span>
          </Link>
        )}

        {/* Right side — account */}
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {/* Mobile: the same search, as an icon. */}
          <Tooltip label="Search">
            {config.search.kind === "palette" ? (
              <button
                type="button"
                onClick={() => openCommandPalette()}
                aria-label="Search"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                <Search className="size-5" aria-hidden />
              </button>
            ) : (
              <Link
                href={config.search.href}
                aria-label="Search"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                <Search className="size-5" aria-hidden />
              </Link>
            )}
          </Tooltip>

          {/* The two frameworks cross symmetrically: each header carries a pill
              pointing at the other. */}
          <Link
            href={config.crossLink.href}
            className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <CrossIcon className="size-4" aria-hidden />
            <span className="hidden lg:inline">{config.crossLink.label}</span>
          </Link>

          <NotificationBell />

          <Suspense fallback={<AccountButtonFallback />}>
            <AccountMenu
              user={user}
              onSignOut={handleSignOut}
              signingOut={signingOut}
            />
          </Suspense>
        </div>
      </div>

      {/* Slide-out navigation drawer. `m` + lazily-loaded features rather
          than `motion`: the header is mounted on every route, so framer's
          full bundle here was first-load JS everywhere. domAnimation covers
          the fade and slide (with exit); `strict` makes a stray `motion.*`
          inside throw instead of quietly pulling the full bundle back in. */}
      {/* Portalled to <body>: the header is `.glass`, and its backdrop-filter
          makes it the containing block for fixed descendants — rendered in
          place, the "full-height" drawer and its scrim were clipped to the
          56px header bar. */}
      {canPortal
        ? createPortal(
            <LazyMotion features={loadDomAnimation} strict>
              <AnimatePresence>
                {drawerOpen ? (
                  <>
                    <m.div
                      key="scrim"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                      onClick={() => setDrawerOpen(false)}
                      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                    />
                    <m.aside
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
                        {config.sections.map((section) => (
                          <div key={section.title}>
                            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                              {section.title}
                            </p>
                            <div className="flex flex-col gap-0.5">
                              {section.items.map((item) => {
                                // An off-site row is a plain anchor: `next/link` would
                                // try to prefetch and client-navigate an absolute URL.
                                const active = isActive(pathname, item);
                                const { Icon } = item;
                                const body = (
                                  <>
                                    <Icon className="size-4 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate">{item.label}</span>
                                      {item.hint ? (
                                        <span className="block truncate text-[11px] font-normal text-muted-foreground/70">
                                          {item.hint}
                                        </span>
                                      ) : null}
                                    </span>
                                    {item.external ? (
                                      <ExternalLink
                                        className="size-3.5 shrink-0 opacity-50"
                                        aria-hidden
                                      />
                                    ) : null}
                                  </>
                                );
                                const className = cn(
                                  // `active:translate-y-px` matches the Button
                                  // primitive's press, so a tap feels the same
                                  // everywhere rather than each surface inventing one.
                                  "group/nav flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors active:translate-y-px",
                                  active
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                );

                                return item.external ? (
                                  <a
                                    key={item.href}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={className}
                                  >
                                    {body}
                                    <span className="sr-only">(opens in a new tab)</span>
                                  </a>
                                ) : (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={className}
                                  >
                                    {body}
                                    {/* Confirms the tap while the route is in flight —
                                        every route here is dynamic, so there is a real
                                        wait to acknowledge. */}
                                    <LinkPending />
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </nav>

                      <div className="mt-auto border-t border-border pt-4">
                        <Suspense fallback={null}>
                          <DrawerIdentity user={user} />
                        </Suspense>
                        <div className="mb-3 flex items-center justify-between px-3">
                          <span className="text-xs text-muted-foreground">Theme</span>
                          <ThemeToggle />
                        </div>
                        <Suspense fallback={null}>
                          <DrawerAdminLink user={user} />
                        </Suspense>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={signingOut}
                          onClick={handleSignOut}
                        >
                          Sign out
                        </Button>
                      </div>
                    </m.aside>
                  </>
                ) : null}
              </AnimatePresence>
            </LazyMotion>,
            document.body,
          )
        : null}
    </header>
  );
}

/** What the account button shows while the server user is still streaming. */
function AccountButtonFallback() {
  return (
    <span aria-hidden className="flex items-center gap-2 rounded-full">
      <Avatar>
        <AvatarFallback>?</AvatarFallback>
      </Avatar>
    </span>
  );
}

/** Display fields for a possibly-absent user ("Account" / "?" when signed out). */
function identity(user: NavUser | null) {
  const name = user?.name ?? "Account";
  return {
    name,
    email: user?.email ?? "",
    initial: name && name !== "Account" ? name[0]!.toUpperCase() : "?",
  };
}

function AccountMenu({
  user: userPromise,
  onSignOut,
  signingOut,
}: {
  user: Promise<NavUser | null>;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const router = useRouter();
  const user = use(userPromise);
  const { name, email, initial } = identity(user);
  const avatarUrl = user?.avatarUrl ?? null;

  return (
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
          <span className="truncate font-medium text-foreground">{name}</span>
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
        {user?.isAdmin ? (
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
        {user?.username ? (
          <DropdownMenuItem
            onClick={() => router.push(`/users/${user.username}`)}
          >
            View public profile
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onSignOut} disabled={signingOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Name and email at the foot of the drawer. */
function DrawerIdentity({ user: userPromise }: { user: Promise<NavUser | null> }) {
  const user = use(userPromise);
  if (!user) return null;
  const { name, email } = identity(user);
  return (
    <div className="mb-2 px-3">
      <p className="truncate text-sm font-medium">{name}</p>
      {email ? (
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      ) : null}
    </div>
  );
}

function DrawerAdminLink({ user: userPromise }: { user: Promise<NavUser | null> }) {
  const user = use(userPromise);
  if (!user?.isAdmin) return null;
  return (
    <Link
      href="/admin"
      className="mb-2 block rounded-md px-3 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-muted hover:text-amber-300"
    >
      🛡 Admin dashboard
    </Link>
  );
}

const subscribeNever = () => () => {};
const isClient = () => true;
const isServer = () => false;
