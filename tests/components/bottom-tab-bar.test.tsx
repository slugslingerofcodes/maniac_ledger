// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bottom tab bars are mounted on every route, so they render framer's
 * lightweight `m` components under `<LazyMotion strict>` with the features
 * fetched asynchronously, instead of `motion.*`, which drags framer's whole
 * feature set into every page's first-load JS.
 *
 * Nothing in the UI would show it if someone swapped a `motion.span` back in —
 * the pill would still slide, the bundle would just quietly grow ~45 KB. These
 * pin the two halves: the pill still renders on the active tab (so the pill
 * didn't get "fixed" away), and `strict` turns a stray `motion.*` into a throw.
 */

let pathname = "/library";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
// LinkPending reads Next's link status, which needs a router context.
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const { BottomTabBar } = await import("@/components/BottomTabBar");
const { MangaBottomTabBar } = await import("@/components/manga/MangaBottomTabBar");

beforeEach(() => {
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

const pills = () => document.querySelectorAll("span.bg-primary\\/15");

describe("BottomTabBar", () => {
  it("puts the pill on the active tab only", () => {
    pathname = "/library";
    const { getByRole } = render(<BottomTabBar />);

    expect(pills()).toHaveLength(1);
    const active = getByRole("link", { current: "page" });
    expect(active.textContent).toContain("Library");
    expect(active.contains(pills()[0]!)).toBe(true);
  });
});

describe("MangaBottomTabBar", () => {
  it("puts the pill on the active tab only", () => {
    pathname = "/manga/search";
    const { getByRole } = render(<MangaBottomTabBar />);

    expect(pills()).toHaveLength(1);
    expect(getByRole("link", { current: "page" }).textContent).toContain("Search");
  });
});
