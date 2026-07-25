// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ShojiDoors drives navigation itself (capture-phase click → router.push).
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/library",
}));

const { ShojiDoors } = await import("@/components/ShojiDoors");

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(() => {
  cleanup();
  document.querySelectorAll("a").forEach((a) => a.remove());
  delete (window as { matchMedia?: unknown }).matchMedia;
});

beforeEach(() => {
  push.mockClear();
  // framer-motion's useReducedMotion needs matchMedia; report motion-safe.
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

/**
 * The "enter the world" doors: a click on a poster card bound for a detail
 * page must paint the doorway with that poster; every other navigation keeps
 * the sumi-e motif. Both sides only run during a real click-driven close, so
 * a regression ships silently — the doors would still open and close, just
 * with the wrong picture.
 */

function addAnchor({ href, withImg }: { href: string; withImg: boolean }) {
  const a = document.createElement("a");
  a.href = href;
  if (withImg) {
    const img = document.createElement("img");
    img.src = "https://cdn.example/poster-1.jpg";
    a.appendChild(img);
  } else {
    a.textContent = "plain link";
  }
  document.body.appendChild(a);
  return a;
}

function posterPanel() {
  return document.querySelector('[style*="poster-1.jpg"]');
}

describe("ShojiDoors — poster world doors", () => {
  it("paints the doorway with the clicked poster on anime detail navigations", () => {
    render(<ShojiDoors />);
    const a = addAnchor({ href: "/anime/abc-123", withImg: true });

    fireEvent.click(a);

    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).not.toBeNull();
  });

  it("keeps the sumi-e motif for poster-less navigations", () => {
    render(<ShojiDoors />);
    const a = addAnchor({ href: "/profile", withImg: false });

    fireEvent.click(a);

    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).toBeNull();
  });

  it("keeps the motif when a poster click heads somewhere other than a detail page", () => {
    render(<ShojiDoors />);
    const a = addAnchor({ href: "/lists/42", withImg: true });

    fireEvent.click(a);

    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).toBeNull();
  });
});

/**
 * The doors sit in front of EVERY navigation, so the WebGL upgrade must stay
 * strictly decorative: the shatter chunk is fetched lazily and may never
 * arrive (offline, no GPU, slow network). If navigation ever waited on it, a
 * failed chunk fetch would turn every poster link in the app into a dead one.
 */
describe("ShojiDoors — navigation never waits on WebGL", () => {
  it("pushes on its own timer even when the shatter never loads", () => {
    vi.useFakeTimers();
    try {
      render(<ShojiDoors />);
      const a = addAnchor({ href: "/anime/abc-123", withImg: true });

      fireEvent.click(a);
      expect(push).not.toHaveBeenCalled(); // doors are still closing

      // No shatter module is ever resolved in this environment (jsdom has no
      // WebGL, so the import is never even requested).
      vi.advanceTimersByTime(300);

      expect(push).toHaveBeenCalledWith("/anime/abc-123");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the sliding panels when the shatter is unavailable", () => {
    render(<ShojiDoors />);
    const a = addAnchor({ href: "/anime/abc-123", withImg: true });

    fireEvent.click(a);

    // Panels present and painted with the poster — the pre-WebGL behaviour.
    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).not.toBeNull();
  });
});
