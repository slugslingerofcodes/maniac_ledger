// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Menu } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared header now gets the signed-in user from the server (a promise
 * the layout passes through) and signs out through the `signOut` Server
 * Action, instead of building the browser Supabase client — ~62 KB gzipped
 * that used to sit in the first-load JS of every authed route.
 *
 * The guard that matters is the last one: nothing on the page would look
 * different if the browser client crept back into the header, the bundle
 * would just quietly regrow. So importing it here fails the whole file.
 */

vi.mock("@/lib/supabase/client", () => {
  throw new Error("the header must not load the browser Supabase client");
});

const signOut = vi.fn();
vi.mock("@/app/auth/actions", () => ({ signOut: () => signOut() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});
// Reminders read through TanStack Query + a Server Action; not under test.
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));

const { FrameworkNav } = await import("@/components/FrameworkNav");

const CONFIG = {
  homeHref: "/",
  homeLabel: "anime_maniacs",
  sections: [
    { title: "Watch", items: [{ label: "Library", href: "/library", Icon: Menu }] },
  ],
  search: { kind: "palette" as const, placeholder: "Search anime…" },
  crossLink: { href: "/manga", label: "Manga", Icon: Menu },
};

const user = {
  name: "rin",
  email: "rin@example.com",
  avatarUrl: null,
  username: "rin",
  isAdmin: false,
};

beforeEach(() => {
  signOut.mockReset();
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

async function renderNav(u: typeof user | null = user) {
  await act(async () => {
    render(<FrameworkNav config={CONFIG} user={Promise.resolve(u)} />);
  });
}

describe("FrameworkNav", () => {
  it("shows the server-provided user on the account button", async () => {
    await renderNav();
    const trigger = await screen.findByLabelText("Account menu");
    expect(trigger.textContent).toContain("rin");
    expect(trigger.textContent).toContain("R");
  });

  it("falls back to the anonymous avatar when there is no user", async () => {
    await renderNav(null);
    const trigger = await screen.findByLabelText("Account menu");
    expect(trigger.textContent).toBe("?");
  });

  it("signs out through the Server Action from the drawer", async () => {
    await renderNav();
    fireEvent.click(screen.getByLabelText("Open navigation"));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("renders the drawer outside the header", async () => {
    // The header is `.glass`: its backdrop-filter makes it the containing
    // block for fixed descendants, so a drawer rendered inside it is clipped
    // to the 56px bar. jsdom has no layout, so pin the DOM placement instead.
    await renderNav();
    fireEvent.click(screen.getByLabelText("Open navigation"));
    const drawer = await screen.findByRole("dialog", { name: "Primary navigation" });

    expect(drawer.closest("header")).toBeNull();
  });

  it("shows the user's name and email at the foot of the drawer", async () => {
    await renderNav();
    fireEvent.click(screen.getByLabelText("Open navigation"));
    const drawer = await screen.findByRole("dialog", { name: "Primary navigation" });
    expect(drawer.textContent).toContain("rin@example.com");
  });
});
