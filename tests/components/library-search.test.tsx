// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryEntryItem } from "@/app/actions/library";

/**
 * The /library search box and filter chips must never touch the network.
 *
 * They used to drive `router.replace`, which is an App Router navigation: one
 * server round trip per keystroke (proxy → auth → a re-render of the library
 * page, which also awaits Jikan), and since the input's value was read back
 * from the URL, each character appeared only once that trip returned. The
 * grid filters a cached list client-side, so none of that was needed.
 *
 * Next 16 keeps `useSearchParams` in sync with `history.replaceState`, but
 * delivers the change in a transition — *after* the render that caused it.
 * The mock models that lag: it serves a snapshot that only moves when a test
 * calls `deliverUrl()`, the stand-in for Next catching up.
 */

afterEach(cleanup);

const routerReplace = vi.fn();
const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: routerReplace, push: routerReplace }),
  usePathname: () => window.location.pathname,
}));

// Server actions and heavy children: the grid's filtering is what's on trial.
vi.mock("@/app/actions/library", () => ({
  getUserLibrary: vi.fn(() => new Promise(() => {})),
  removeFromLibraryAction: vi.fn(),
}));
vi.mock("@/app/actions/progress", () => ({
  bulkUpdateStatus: vi.fn(),
  upsertProgress: vi.fn(),
}));
vi.mock("@/components/library-card", () => ({
  LibraryCard: ({ item }: { item: { title: string } }) => (
    <p data-testid="card">{item.title}</p>
  ),
}));
vi.mock("@/components/anime/AdvanceEpisodeButton", () => ({ AdvanceEpisodeButton: () => null }));
vi.mock("@/components/anime/QuickLookSheet", () => ({ QuickLookSheet: () => null }));
vi.mock("@/components/PullToRefresh", () => ({
  PullToRefresh: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/TitleLanguageToggle", () => ({ TitleLanguageToggle: () => null }));
vi.mock("@/components/SlimeIllustration", () => ({ SlimeIllustration: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/hooks/use-title-language", () => ({
  useTitleLanguage: () => ["romaji"],
  displayTitle: (_lang: string, title: string) => title,
}));
vi.mock("framer-motion", () => {
  const div = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  // The grid renders `m.*` (features lazy-loaded by the layout's LazyMotion);
  // `motion` stays mapped too, so either spelling renders.
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    m: { div },
    motion: { div },
    useReducedMotion: () => true,
  };
});

const { LibraryGridClient } = await import("@/app/(app)/library/library-grid-client");

function entry(id: string, title: string, genres: string[] = []): LibraryEntryItem {
  return {
    id,
    malId: Number(id),
    title,
    titleEnglish: null,
    posterUrl: null,
    type: null,
    status: "watching",
    episodesWatched: 0,
    totalEpisodes: 12,
    score: null,
    genres,
  };
}

const LIBRARY = [
  entry("1", "Sousou no Frieren", ["Adventure"]),
  entry("2", "Fruits Basket", ["Romance"]),
  entry("3", "Vinland Saga", ["Action"]),
];

let fetchMock: ReturnType<typeof vi.fn>;
let replaceState: ReturnType<typeof vi.spyOn>;

function renderGrid(filter: "all" | "watching" = "all") {
  const client = new QueryClient();
  client.setQueryData(["user-library"], LIBRARY);
  const ui = (f: typeof filter) => (
    <QueryClientProvider client={client}>
      <LibraryGridClient filter={f} />
    </QueryClientProvider>
  );
  const view = render(ui(filter));
  return { rerender: (f: typeof filter = filter) => view.rerender(ui(f)) };
}

/** Next delivering the current URL to `useSearchParams` consumers. */
function deliverUrl() {
  nav.search = window.location.search;
}

/** Sets the URL as a page load would find it. */
function startAt(url: string) {
  window.history.replaceState(null, "", url);
  deliverUrl();
}

const cards = () => screen.queryAllByTestId("card").map((c) => c.textContent);
const searchBox = () => screen.getByRole("textbox", { name: "Search your library" });

beforeEach(() => {
  vi.useFakeTimers();
  startAt("/library");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  replaceState = vi.spyOn(window.history, "replaceState");
  routerReplace.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("library search", () => {
  it("filters on every keystroke with zero network requests", () => {
    renderGrid();

    for (const text of ["f", "fr", "fri", "frie"]) {
      fireEvent.change(searchBox(), { target: { value: text } });
      // The character is there at once — not after a server round trip.
      expect((searchBox() as HTMLInputElement).value).toBe(text);
    }

    expect(cards()).toEqual(["Sousou no Frieren"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("writes the URL once typing pauses, not per keystroke", () => {
    renderGrid();

    for (const text of ["v", "vi", "vin"]) {
      fireEvent.change(searchBox(), { target: { value: text } });
      // A brisk typist: well inside the pause that triggers a write.
      act(() => {
        vi.advanceTimersByTime(60);
      });
    }
    expect(replaceState).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?q=vin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores a search from the URL, so Back and bookmarks keep it", () => {
    startAt("/library?q=saga");

    renderGrid();

    expect((searchBox() as HTMLInputElement).value).toBe("saga");
    expect(cards()).toEqual(["Vinland Saga"]);
  });

  it("follows the URL when a status tab replaces it without q", () => {
    startAt("/library?q=saga");
    const { rerender } = renderGrid();

    window.history.pushState(null, "", "/library?status=watching");
    deliverUrl();
    rerender("watching");

    expect((searchBox() as HTMLInputElement).value).toBe("");
  });

  it("doesn't let its own URL write clobber text typed since", () => {
    const { rerender } = renderGrid();
    fireEvent.change(searchBox(), { target: { value: "fru" } });
    act(() => {
      vi.advanceTimersByTime(250); // URL now says q=fru
    });
    fireEvent.change(searchBox(), { target: { value: "fruits" } });

    deliverUrl(); // Next delivering the q=fru update, after the keystroke
    rerender();

    expect((searchBox() as HTMLInputElement).value).toBe("fruits");
  });

  it("filters by genre chip through the URL, still with no request", () => {
    const { rerender } = renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Romance" }));
    deliverUrl();
    rerender();

    expect(window.location.search).toBe("?genre=Romance");
    expect(cards()).toEqual(["Fruits Basket"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("clears every filter, box included, without a request", () => {
    startAt("/library?q=saga&genre=Action");
    const { rerender } = renderGrid();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    deliverUrl();
    rerender();

    expect((searchBox() as HTMLInputElement).value).toBe("");
    expect(window.location.search).toBe("");
    expect(cards()).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("stats for the current search / filter", () => {
  const stats = () => screen.queryByRole("region", { name: "Stats for these results" });

  it("stays hidden with no search or filter — and for a sort alone", () => {
    startAt("/library?sort=title");

    renderGrid();

    expect(stats()).toBeNull();
  });

  it("appears for a search, counting exactly what the grid shows", () => {
    renderGrid();

    fireEvent.change(searchBox(), { target: { value: "saga" } });

    expect(cards()).toEqual(["Vinland Saga"]);
    expect(stats()?.textContent).toContain("1 of 3 titles match.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appears for a genre chip", () => {
    const { rerender } = renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Romance" }));
    deliverUrl();
    rerender();

    expect(stats()?.textContent).toContain("1 of 3 titles match.");
  });

  it("appears on a status tab, measured against the whole library", () => {
    renderGrid("watching");

    expect(stats()?.textContent).toContain("3 of 3 titles match.");
  });

  it("gives way to the empty state when nothing matches", () => {
    renderGrid();

    fireEvent.change(searchBox(), { target: { value: "zzz" } });

    expect(stats()).toBeNull();
    expect(screen.getByText(/No anime in your library match/)).toBeDefined();
  });
});
