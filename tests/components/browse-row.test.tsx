// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrowseRow } from "@/components/browse/BrowseRow";
import { nextRowIndex } from "@/components/browse/row-nav";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * Keyboard model of a home-page row: one tab stop per row (roving tabindex),
 * ←/→ between items, Home/End to the ends.
 *
 * Why it's pinned: the home page is a dozen rows of up to eighteen cards. With
 * a plain tab order that's ~200 stops before the footer, and every card's
 * quick-action buttons would add two more each. The failure mode is silent —
 * nothing looks broken with a mouse — so it needs a test, not a glance.
 */

function Item({ n }: { n: number }) {
  return (
    <div data-row-item="" role="listitem">
      <a href={`/t/${n}`} data-row-focus="">
        Title {n}
      </a>
      <button type="button">Add {n}</button>
    </div>
  );
}

function items(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => <Item key={i + offset} n={i + offset} />);
}

function renderRow(count = 5) {
  const view = render(<BrowseRow title="Popular">{items(count)}</BrowseRow>);
  const links = Array.from({ length: count }, (_, i) => screen.getByText(`Title ${i}`));
  const buttons = Array.from({ length: count }, (_, i) => screen.getByText(`Add ${i}`));
  return { view, links, buttons };
}

describe("nextRowIndex", () => {
  it("steps right and left", () => {
    expect(nextRowIndex("ArrowRight", 2, 5)).toBe(3);
    expect(nextRowIndex("ArrowLeft", 2, 5)).toBe(1);
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(nextRowIndex("ArrowRight", 4, 5)).toBe(4);
    expect(nextRowIndex("ArrowLeft", 0, 5)).toBe(0);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextRowIndex("Home", 3, 5)).toBe(0);
    expect(nextRowIndex("End", 1, 5)).toBe(4);
  });

  it("ignores keys that aren't its own, and empty rows", () => {
    expect(nextRowIndex("ArrowDown", 1, 5)).toBeNull();
    expect(nextRowIndex("Enter", 1, 5)).toBeNull();
    expect(nextRowIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("BrowseRow keyboard navigation", () => {
  it("is a single tab stop: only the first card (and its own buttons) are tabbable", () => {
    const { links, buttons } = renderRow();

    expect(links.map((l) => l.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("moves focus with the arrow keys and carries the tab stop along", () => {
    const { links } = renderRow();
    links[0]!.focus();

    fireEvent.keyDown(links[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[1]);
    expect(links[1]!.tabIndex).toBe(0);
    expect(links[0]!.tabIndex).toBe(-1);

    fireEvent.keyDown(links[1]!, { key: "ArrowRight" });
    fireEvent.keyDown(links[2]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(links[1]);
  });

  it("jumps to the last and first card with End and Home", () => {
    const { links } = renderRow();
    links[0]!.focus();

    fireEvent.keyDown(links[0]!, { key: "End" });
    expect(document.activeElement).toBe(links[4]);

    fireEvent.keyDown(links[4]!, { key: "Home" });
    expect(document.activeElement).toBe(links[0]);
  });

  it("stays put at the ends rather than wrapping around", () => {
    const { links } = renderRow(3);
    links[0]!.focus();

    fireEvent.keyDown(links[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(links[0]);

    fireEvent.keyDown(links[0]!, { key: "End" });
    fireEvent.keyDown(links[2]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[2]);
  });

  it("navigates from a card's quick-action button too", () => {
    const { links, buttons } = renderRow();
    buttons[0]!.focus();

    fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[1]);
  });

  it("makes a card focused some other way (click, screen reader) the tab stop", () => {
    const { links } = renderRow();

    links[3]!.focus();
    expect(links[3]!.tabIndex).toBe(0);
    expect(links[0]!.tabIndex).toBe(-1);
  });

  it("leaves modified keys and vertical arrows to the browser", () => {
    const { links } = renderRow();
    links[0]!.focus();

    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(links[0]!, { key: "ArrowRight", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(links[0]!, { key: "ArrowDown" })).toBe(true);
    expect(document.activeElement).toBe(links[0]);
  });

  it("gives a swapped-in list (a tab switch) a tab stop as well", () => {
    const { view } = renderRow(4);
    view.rerender(<BrowseRow title="Popular">{items(3, 10)}</BrowseRow>);

    const fresh = [10, 11, 12].map((n) => screen.getByText(`Title ${n}`));
    expect(fresh.map((l) => l.tabIndex)).toEqual([0, -1, -1]);
  });
});
