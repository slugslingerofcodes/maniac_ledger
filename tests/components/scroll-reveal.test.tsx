// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollReveal } from "@/components/ScrollReveal";

/**
 * Motion-safe half of the ScrollReveal pair. framer-motion caches the
 * reduced-motion preference in a module-level singleton at first use, and as
 * an externalized dep it survives vi.resetModules() — so the two preference
 * states live in two test FILES (fresh worker each), not two tests here.
 * The reduced-motion half is scroll-reveal-reduced.test.tsx.
 */

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

beforeEach(() => {
  // jsdom lacks IntersectionObserver; framer's whileInView needs one.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Motion allowed.
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

describe("ScrollReveal (motion allowed)", () => {
  it("starts hidden, waiting for the viewport to reveal it", () => {
    const { getByText } = render(
      <ScrollReveal>
        <p>synopsis</p>
      </ScrollReveal>,
    );

    // If the hidden initial state disappears, the slide transition has
    // silently stopped happening.
    const wrapper = getByText("synopsis").parentElement!;
    expect(wrapper.style.opacity).toBe("0");
  });
});
