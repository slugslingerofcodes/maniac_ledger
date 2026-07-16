// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Skip the debounce timer entirely — return the value synchronously.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: string) => v }));

const { CommandPalette } = await import("@/components/CommandPalette");

/** Fire the global ⌘/Ctrl+K shortcut the palette listens for. */
function pressCmdK() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The anime-search fetch: default to empty so page results are deterministic.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommandPalette", () => {
  it("renders nothing until opened", () => {
    render(<CommandPalette />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Ctrl/⌘+K", () => {
    render(<CommandPalette />);

    pressCmdK();

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
  });

  it("lists navigation pages when opened with no query", () => {
    render(<CommandPalette />);
    pressCmdK();

    // Every nav item plus Home/Profile should be reachable.
    expect(screen.getByRole("option", { name: /Library/ })).toBeDefined();
    expect(screen.getByRole("option", { name: /Songs/ })).toBeDefined();
  });

  it("filters pages by the typed query", () => {
    render(<CommandPalette />);
    pressCmdK();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "song" } });

    expect(screen.getByRole("option", { name: /Songs/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: /Library/ })).toBeNull();
  });

  it("navigates to a page on click, then closes", () => {
    render(<CommandPalette />);
    pressCmdK();

    fireEvent.click(screen.getByRole("option", { name: /Library/ }));

    expect(push).toHaveBeenCalledWith("/library");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<CommandPalette />);
    pressCmdK();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles shut on a second Ctrl+K", () => {
    render(<CommandPalette />);
    pressCmdK();
    expect(screen.getByRole("dialog")).toBeDefined();

    pressCmdK();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves the active option with the arrow keys", () => {
    render(<CommandPalette />);
    pressCmdK();
    const input = screen.getByRole("combobox");

    // First option is active initially; ArrowDown advances it.
    const firstId = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const secondId = input.getAttribute("aria-activedescendant");

    expect(firstId).not.toBe(secondId);
  });
});
