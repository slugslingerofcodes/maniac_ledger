import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GSAP is loaded on demand (lib/gsap-loader). Two properties keep that from
 * changing how the scroll motion behaves:
 *
 *  - once loaded, setup runs *synchronously* inside the caller's layout
 *    effect, so a client-side navigation sets the hidden "from" state before
 *    paint, exactly as the static import did — no visible-then-hidden flicker;
 *  - a component that unmounts while GSAP is still downloading never gets a
 *    tween attached afterwards (that would leak a ScrollTrigger on a node
 *    that's gone).
 *
 * Fresh module per test: the loader caches the module at module scope.
 */

let loader: typeof import("@/lib/gsap-loader");

beforeEach(async () => {
  vi.resetModules();
  loader = await import("@/lib/gsap-loader");
});

describe("withGsap", () => {
  it("runs setup synchronously once GSAP has loaded", async () => {
    await loader.loadGsap();
    const setup = vi.fn();

    loader.withGsap(setup);

    expect(setup).toHaveBeenCalledOnce();
  });

  it("defers setup until the first load completes", async () => {
    const setup = vi.fn();

    loader.withGsap(setup);
    expect(setup).not.toHaveBeenCalled();

    await loader.loadGsap();
    expect(setup).toHaveBeenCalledOnce();
  });

  it("never sets up after the caller has already cleaned up", async () => {
    const setup = vi.fn();

    const cleanup = loader.withGsap(setup);
    cleanup();
    await loader.loadGsap();

    expect(setup).not.toHaveBeenCalled();
  });

  it("runs the setup's own cleanup when the caller cleans up", async () => {
    await loader.loadGsap();
    const revert = vi.fn();

    loader.withGsap(() => revert)();

    expect(revert).toHaveBeenCalledOnce();
  });
});
