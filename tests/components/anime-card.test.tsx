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

    expect(screen.getByText("7 / 28 episodes")).toBeDefined();
  });

  it("drops the total when it is unknown", () => {
    render(<AnimeCard item={item({ totalEpisodes: null })} />);

    expect(screen.getByText("7 episodes")).toBeDefined();
  });

  it("falls back to a placeholder when there is no poster", () => {
    render(<AnimeCard item={item({ posterUrl: null })} />);

    expect(screen.getByText("No image")).toBeDefined();
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
