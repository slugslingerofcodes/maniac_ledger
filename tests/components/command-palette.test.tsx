// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Skip the debounce timer entirely — return the value synchronously.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: string) => v }));

const { CommandPalette } = await import("@/components/CommandPalette");

/** The palette's searches are TanStack queries; each test gets a fresh cache. */
function renderPalette(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
  );
  return client;
}

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
    renderPalette();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Ctrl/⌘+K", () => {
    renderPalette();

    pressCmdK();

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
  });

  it("lists navigation pages when opened with no query", () => {
    renderPalette();
    pressCmdK();

    // Every nav item plus Home/Profile should be reachable.
    expect(screen.getByRole("option", { name: /Library/ })).toBeDefined();
    expect(screen.getByRole("option", { name: /Songs/ })).toBeDefined();
  });

  it("filters pages by the typed query", () => {
    renderPalette();
    pressCmdK();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "song" } });

    expect(screen.getByRole("option", { name: /Songs/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: /Library/ })).toBeNull();
  });

  it("navigates to a page on click, then closes", () => {
    renderPalette();
    pressCmdK();

    fireEvent.click(screen.getByRole("option", { name: /Library/ }));

    expect(push).toHaveBeenCalledWith("/library");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    renderPalette();
    pressCmdK();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles shut on a second Ctrl+K", () => {
    renderPalette();
    pressCmdK();
    expect(screen.getByRole("dialog")).toBeDefined();

    pressCmdK();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves the active option with the arrow keys", () => {
    renderPalette();
    pressCmdK();
    const input = screen.getByRole("combobox");

    // First option is active initially; ArrowDown advances it.
    const firstId = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const secondId = input.getAttribute("aria-activedescendant");

    expect(firstId).not.toBe(secondId);
  });
});

describe("CommandPalette title search", () => {
  /** Answers each endpoint the palette calls; records every URL asked for. */
  function stubSearch() {
    const fetchMock = vi.fn((url: string) => {
      const results = url.startsWith("/api/manga/search")
        ? [
            {
              mal_id: 2,
              mangadex_id: null,
              title: "Sousou no Frieren",
              title_english: "Frieren: Beyond Journey's End (manga)",
              images: { jpg: { image_url: null } },
            },
          ]
        : url.includes("engine=catalog")
          ? []
          : [
              {
                mal_id: 52991,
                title: "Sousou no Frieren",
                title_english: "Frieren: Beyond Journey's End",
                year: 2023,
                images: { jpg: { image_url: null } },
              },
            ];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const type = (value: string) =>
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });

  it("shows library matches on the keystroke, before any search answers", () => {
    // Searches never resolve: anything on screen came from the cache.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const client = new QueryClient();
    client.setQueryData(
      ["user-library"],
      [{ malId: 52991, title: "Sousou no Frieren", titleEnglish: "Frieren", posterUrl: null }],
    );
    renderPalette(client);
    pressCmdK();

    type("frie");

    expect(screen.getByRole("option", { name: /Frieren.*In library/ })).toBeDefined();
  });

  it("searches anime and manga over abortable GETs, not a server action", async () => {
    const fetchMock = stubSearch();
    renderPalette();
    pressCmdK();

    type("frieren");

    expect(
      await screen.findByRole("option", { name: /Frieren: Beyond Journey's Ends*2023/ }),
    ).toBeDefined();
    expect(await screen.findByRole("option", { name: /\(manga\)/ })).toBeDefined();
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toContain("/api/anime/search?q=frieren&limit=6");
    expect(urls).toContain("/api/manga/search?q=frieren&limit=4");
    // Every search can be cancelled when the next keystroke supersedes it.
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("answers a retyped query from cache instead of searching again", async () => {
    const fetchMock = stubSearch();
    renderPalette();
    pressCmdK();

    type("frieren");
    await screen.findByRole("option", { name: /Frieren: Beyond Journey's Ends*2023/ });
    const liveCalls = () =>
      fetchMock.mock.calls.filter(([url]) => url === "/api/anime/search?q=frieren&limit=6")
        .length;
    expect(liveCalls()).toBe(1);

    type("f");
    type("frieren");

    expect(
      screen.getByRole("option", { name: /Frieren: Beyond Journey's Ends*2023/ }),
    ).toBeDefined();
    expect(liveCalls()).toBe(1);
  });
});
