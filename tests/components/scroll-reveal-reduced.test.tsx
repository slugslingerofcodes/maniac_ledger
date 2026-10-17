// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollReveal } from "@/components/ScrollReveal";
import { loadGsap } from "@/lib/gsap-loader";

/**
 * GSAP is fetched on first use (lib/gsap-loader), so the reveal is set up a
 * tick after mount. Wait for that, or these assert on the pre-GSAP render —
 * which is plainly visible, and would make the reduced-motion test pass for
 * the wrong reason.
 */
async function settle() {
  await act(async () => {
    await loadGsap();
  });
}

/**
 * Reduced-motion half of the ScrollReveal pair (see scroll-reveal.test.tsx
 * for why the two preference states are separate files). This is the guard
 * that can really hurt users: reduced-motion must get the content plainly
 * visible, never parked at the animation's hidden initial state.
 */

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Reduced motion requested.
  window.matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe("ScrollReveal (reduced motion)", () => {
  it("renders content plainly, with no hidden initial state", async () => {
    const { getByText } = render(
      <ScrollReveal>
        <p>synopsis</p>
      </ScrollReveal>,
    );

    await settle();

    const wrapper = getByText("synopsis").parentElement!;
    expect(wrapper.style.opacity === "" || wrapper.style.opacity === "1").toBe(
      true,
    );
  });
});
