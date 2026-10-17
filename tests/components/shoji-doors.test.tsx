// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
  // The reduced-motion check reads matchMedia; report motion-safe.
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

/**
 * Mount the doors and let their panels chunk arrive. The panels (framer-motion)
 * load on idle after hydration rather than with the root layout, so a test
 * that clicks must first give that idle load — a 1ms timeout under jsdom,
 * which has no requestIdleCallback — time to land.
 */
async function renderDoors() {
  render(<ShojiDoors />);
  await act(async () => {
    await import("@/components/doors/DoorPanels");
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function posterPanel() {
  return document.querySelector('[style*="poster-1.jpg"]');
}

describe("ShojiDoors — poster world doors", () => {
  it("paints the doorway with the clicked poster on anime detail navigations", async () => {
    await renderDoors();
    const a = addAnchor({ href: "/anime/abc-123", withImg: true });

    fireEvent.click(a);

    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).not.toBeNull();
  });

  it("keeps the sumi-e motif for poster-less navigations", async () => {
    await renderDoors();
    const a = addAnchor({ href: "/profile", withImg: false });

    fireEvent.click(a);

    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).toBeNull();
  });

  it("keeps the motif when a poster click heads somewhere other than a detail page", async () => {
    await renderDoors();
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
  it("pushes on its own timer even when the shatter never loads", async () => {
    await renderDoors();
    vi.useFakeTimers();
    try {
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

  it("falls back to the sliding panels when the shatter is unavailable", async () => {
    await renderDoors();
    const a = addAnchor({ href: "/anime/abc-123", withImg: true });

    fireEvent.click(a);

    // Panels present and painted with the poster — the pre-WebGL behaviour.
    expect(document.querySelectorAll(".shoji-panel").length).toBe(2);
    expect(posterPanel()).not.toBeNull();
  });
});

/**
 * The panels are fetched on idle, so a click can in principle beat them (the
 * first idle moment of a cold load). Holding that click behind doors that
 * can't be drawn would be a dead link for DOOR_MS with nothing on screen, so
 * it must fall through to the link's own navigation instead.
 */
describe("ShojiDoors — before the panels arrive", () => {
  it("lets a click navigate natively instead of holding it", () => {
    render(<ShojiDoors />);
    const a = addAnchor({ href: "/anime/abc-123", withImg: true });

    const notCancelled = fireEvent.click(a);

    expect(notCancelled).toBe(true); // no preventDefault: the link navigates
    expect(document.querySelectorAll(".shoji-panel").length).toBe(0);
  });
});
