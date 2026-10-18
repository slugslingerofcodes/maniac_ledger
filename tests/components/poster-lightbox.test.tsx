// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PosterLightbox } from "@/components/PosterLightbox";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * The zoomed poster used to render in place. On the detail page that put it
 * inside the hero, which is `isolate` (its own stacking context), so its
 * z-index only ranked within the hero: the Information panel and the sticky
 * header painted over the "full-screen" poster, and it looked like a card
 * stuck between sections. It must live directly under <body>.
 */
function renderInIsolatedHero() {
  return render(
    <section style={{ isolation: "isolate", overflow: "hidden" }} data-testid="hero">
      <PosterLightbox src="https://cdn.myanimelist.net/images/anime/1/1.jpg" alt="Frieren">
        <span>poster</span>
      </PosterLightbox>
    </section>,
  );
}

describe("PosterLightbox", () => {
  it("opens the zoomed poster directly under <body>, outside the hero", () => {
    renderInIsolatedHero();
    fireEvent.click(screen.getByRole("button", { name: "View full poster for Frieren" }));

    const dialog = screen.getByRole("dialog", { name: "Poster for Frieren" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByTestId("hero").contains(dialog)).toBe(false);
  });

  it("moves focus to Close and locks page scroll while open", () => {
    renderInIsolatedHero();
    fireEvent.click(screen.getByRole("button", { name: "View full poster for Frieren" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes on Escape, restores scrolling and returns focus to the poster", () => {
    renderInIsolatedHero();
    const trigger = screen.getByRole("button", { name: "View full poster for Frieren" });
    fireEvent.click(trigger);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
});
