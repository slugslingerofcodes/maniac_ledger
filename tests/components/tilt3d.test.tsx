// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tilt3D } from "@/components/Tilt3D";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(() => {
  cleanup();
  // jsdom has no matchMedia; individual tests install a mock, so drop it.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/**
 * The 3D tilt arms itself only on hover-capable, motion-safe devices. Both
 * halves of that gate matter: armed, the glare overlay must exist (the effect
 * is live); disarmed — touch, reduced motion, or no matchMedia at all (jsdom,
 * SSR-adjacent embedders) — the component must degrade to an inert wrapper
 * that still renders its children. A regression on either side ships silently:
 * one loses the whole feature, the other crashes cards on devices we don't
 * hand-test.
 */

function mockMatchMedia({ finePointer, reducedMotion }: {
  finePointer: boolean;
  reducedMotion: boolean;
}) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reducedMotion
      : finePointer,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // Legacy fields some libraries probe for.
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** The glare overlay only mounts once the tilt is armed. */
function glareOf(container: HTMLElement) {
  return container.querySelector(".mix-blend-overlay");
}

describe("Tilt3D", () => {
  it("stays inert when matchMedia is unavailable, still rendering children", () => {
    const { container, getByText } = render(
      <Tilt3D>
        <p>poster</p>
      </Tilt3D>,
    );

    expect(getByText("poster")).toBeDefined();
    expect(glareOf(container)).toBeNull();
  });

  it("arms on hover-capable, motion-safe devices", () => {
    mockMatchMedia({ finePointer: true, reducedMotion: false });

    const { container } = render(
      <Tilt3D>
        <p>poster</p>
      </Tilt3D>,
    );

    expect(glareOf(container)).not.toBeNull();
  });

  it("respects prefers-reduced-motion even with a fine pointer", () => {
    mockMatchMedia({ finePointer: true, reducedMotion: true });

    const { container } = render(
      <Tilt3D>
        <p>poster</p>
      </Tilt3D>,
    );

    expect(glareOf(container)).toBeNull();
  });

  it("stays inert on coarse-pointer (touch) devices", () => {
    mockMatchMedia({ finePointer: false, reducedMotion: false });

    const { container } = render(
      <Tilt3D>
        <p>poster</p>
      </Tilt3D>,
    );

    expect(glareOf(container)).toBeNull();
  });
});
