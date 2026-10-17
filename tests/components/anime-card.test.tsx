// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// AnimeCard renders through MorphLink, which calls useRouter.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AnimeCard } = await import("@/components/anime-card");
type AnimeCardItem = import("@/components/anime-card").AnimeCardItem;

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * The library grid card. Rendering tests exist for exactly the class of bug
 * the data-layer suite can't see — a card that quietly renders the wrong
 * count, drops its fallback, or loses its link.
 */

function item(overrides: Partial<AnimeCardItem> = {}): AnimeCardItem {
  return {
    id: "anime-1",
    malId: 52991,
    title: "Sousou no Frieren",
    posterUrl: "https://cdn.example/p.jpg",
    type: "tv",
    status: "watching",
    episodesWatched: 7,
    totalEpisodes: 28,
    score: 9,
    ...overrides,
  };
}

describe("AnimeCard", () => {
  it("links to the detail page by catalog id", () => {
    render(<AnimeCard item={item()} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("/anime/anime-1");
  });

  it("shows the title and the watch-status label", () => {
    render(<AnimeCard item={item()} />);

    expect(screen.getByText("Sousou no Frieren")).toBeDefined();
    expect(screen.getByText("Watching")).toBeDefined();
  });

  it("shows progress as watched / total", () => {
    render(<AnimeCard item={item()} />);

    expect(screen.getByText("7 / 28 ep")).toBeDefined();
  });

  it("drops the total when it is unknown", () => {
    render(<AnimeCard item={item({ totalEpisodes: null })} />);

    expect(screen.getByText("7 ep")).toBeDefined();
  });

  it("fills the poster slot with the title's initial when there is no art", () => {
    const { container } = render(<AnimeCard item={item({ posterUrl: null })} />);

    // A missing poster must still occupy the full 2:3 cell, or the grid's
    // rhythm breaks around it — so assert the placeholder is really there,
    // not just that some substitute text rendered.
    expect(container.querySelector('[data-slot="poster-fallback"]')).not.toBeNull();
    expect(screen.getByText("S")).toBeDefined();
  });

  it("hides the progress bar when the episode total is unknown", () => {
    // The bar encodes watched/total as a width; with no total there is no
    // fraction to draw, and a full-width bar would read as "finished".
    const withTotal = render(<AnimeCard item={item()} />);
    expect(
      withTotal.container.querySelector(".bg-\\[var\\(--status-accent\\)\\]"),
    ).not.toBeNull();
    withTotal.unmount();

    const withoutTotal = render(<AnimeCard item={item({ totalEpisodes: null })} />);
    expect(
      withoutTotal.container.querySelector(".bg-\\[var\\(--status-accent\\)\\]"),
    ).toBeNull();
  });

  it("renders the score ring only when rated", () => {
    const rated = render(<AnimeCard item={item({ score: 9 })} />);
    expect(rated.container.querySelector('svg[role="img"]')).not.toBeNull();
    rated.unmount();

    const unrated = render(<AnimeCard item={item({ score: null })} />);
    expect(unrated.container.querySelector('svg[role="img"]')).toBeNull();
  });

  it("uppercases the media type badge", () => {
    render(<AnimeCard item={item({ type: "tv" })} />);

    // The uppercase is CSS (tracking-wide uppercase), so assert the class,
    // not the transformed text.
    const badge = screen.getByText("tv");
    expect(badge.className).toContain("uppercase");
  });
});
