// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CosmosItem } from "@/components/cosmos/PosterCosmos";

// The scene itself needs a real GPU; this suite is about the gate in front of
// it, so stand the WebGL component in for a marker.
vi.mock("@/components/cosmos/PosterCosmos", () => ({
  PosterCosmos: ({ items }: { items: CosmosItem[] }) => (
    <div data-testid="cosmos-scene">{items.length} cards</div>
  ),
}));

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

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

/**
 * The WebGL probe is memoised at module scope (creating a GL context per
 * render would be absurd), so each case needs a fresh module — otherwise the
 * first test's answer decides every later one.
 */
async function freshStage() {
  vi.resetModules();
  const mod = await import("@/components/cosmos/CosmosStage");
  return mod.CosmosStage;
}

/** jsdom ships no WebGL, so the "supported" path has to be faked. */
function withWebGL(supported: boolean) {
  vi.stubGlobal("WebGLRenderingContext", supported ? function () {} : undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    supported ? ({} as unknown as RenderingContext) : null,
  ) as unknown as HTMLCanvasElement["getContext"];
}

const items: CosmosItem[] = [
  {
    key: "52991",
    href: "/anime/mal/52991",
    title: "Sousou no Frieren",
    posterUrl: "https://cdn.example/p.jpg",
    score: 9,
  },
];

/**
 * The cosmos is decorative, so every failure mode here is silent by nature —
 * a browser without WebGL, or an empty library, would otherwise render a black
 * rectangle with no explanation and no way onward. Each fallback must say what
 * happened and offer a route out.
 */
describe("CosmosStage", () => {
  it("renders the scene when WebGL is available", async () => {
    withWebGL(true);
    const CosmosStage = await freshStage();

    render(<CosmosStage items={items} />);

    expect(await screen.findByTestId("cosmos-scene")).toBeDefined();
  });

  it("explains itself and links to the grid when WebGL is missing", async () => {
    withWebGL(false);
    const CosmosStage = await freshStage();

    render(<CosmosStage items={items} />);

    expect(screen.queryByTestId("cosmos-scene")).toBeNull();
    expect(
      screen.getByRole("link", { name: /library/i }).getAttribute("href"),
    ).toBe("/library");
  });

  it("explains an empty pool as an outage, not as an empty library", async () => {
    // The pool comes from the catalog now, not the signed-in user's library,
    // so "no items" means every upstream tier failed. Telling someone to go add
    // anime would be advice that cannot possibly help.
    withWebGL(true);
    const CosmosStage = await freshStage();

    render(<CosmosStage items={[]} />);

    expect(screen.queryByTestId("cosmos-scene")).toBeNull();
    expect(screen.getByText(/reach the anime catalog/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /library/i }).getAttribute("href"),
    ).toBe("/library");
  });

  it("still mounts the scene under reduced motion — it tames it, never removes it", async () => {
    withWebGL(true);
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const CosmosStage = await freshStage();

    render(<CosmosStage items={items} />);

    expect(await screen.findByTestId("cosmos-scene")).toBeDefined();
  });
});
