// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowseItem } from "@/lib/browse-item";

vi.mock("@/app/actions/library", () => ({ addToLibraryAction: vi.fn() }));
vi.mock("@/app/actions/progress", () => ({ upsertProgress: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { addToLibraryAction } = await import("@/app/actions/library");
const { upsertProgress } = await import("@/app/actions/progress");
const { toast } = await import("sonner");
const { track } = await import("@/lib/analytics");
const { DiscoverCard } = await import("@/components/browse/DiscoverCard");
const { __resetLibraryState } = await import("@/components/browse/library-state");

afterEach(cleanup);
beforeEach(() => {
  __resetLibraryState();
  vi.mocked(addToLibraryAction).mockReset();
  vi.mocked(upsertProgress).mockReset();
  vi.mocked(track).mockReset();
});

/**
 * The card's quick actions are optimistic: the label flips before the server
 * answers, and a failure flips it back and says why. Both halves matter — a
 * card that waits feels broken on a slow connection, and one that never rolls
 * back claims a title is in your library when it isn't.
 */

const item: BrowseItem = {
  malId: 52991,
  title: "Sousou no Frieren",
  titleEnglish: "Frieren",
  posterUrl: null,
  type: "TV",
  year: 2023,
  episodes: 28,
  score: 9.3,
  synopsis: "An elf mage outlives her party.",
  genres: ["Adventure", "Drama", "Fantasy"],
  studio: "Madhouse",
  airingStatus: "Finished Airing",
  season: "fall",
};

/** A promise the test resolves by hand, to look at the in-between state. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("DiscoverCard quick actions", () => {
  it("shows 'In library' the moment + Library is pressed, before the server answers", async () => {
    const pending = deferred<Awaited<ReturnType<typeof addToLibraryAction>>>();
    vi.mocked(addToLibraryAction).mockReturnValue(pending.promise);
    render(<DiscoverCard item={item} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Frieren to your library" }));

    expect(screen.getByText(/In library · Plan to Watch/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add Frieren to your library" })).toBeNull();
    // The action got the full record back, not a stub that would blank the
    // catalog row on upsert.
    expect(vi.mocked(addToLibraryAction).mock.calls[0]![0]).toMatchObject({
      mal_id: 52991,
      synopsis: "An elf mage outlives her party.",
      studios: [{ name: "Madhouse" }],
    });

    await act(async () => pending.resolve({ ok: true, alreadyAdded: false, animeId: "uuid-1" }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("rolls back and reports the error when the add fails", async () => {
    vi.mocked(addToLibraryAction).mockResolvedValue({ ok: false, error: "You must be signed in." });
    render(<DiscoverCard item={item} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Frieren to your library" }));
    });

    expect(screen.queryByText(/In library/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add Frieren to your library" })).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith("You must be signed in.");
  });

  it("marks a new title watching by adding it, then setting the status", async () => {
    vi.mocked(addToLibraryAction).mockResolvedValue({ ok: true, alreadyAdded: false, animeId: "uuid-1" });
    vi.mocked(upsertProgress).mockResolvedValue({ ok: true });
    render(<DiscoverCard item={item} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark Frieren as watching" }));
    });

    expect(upsertProgress).toHaveBeenCalledWith("uuid-1", { status: "watching" });
    expect(screen.getByText(/In library · Watching/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Frieren: watching" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("skips the add for a title already in the library", async () => {
    vi.mocked(upsertProgress).mockResolvedValue({ ok: true });
    render(<DiscoverCard item={item} entry={{ animeId: "uuid-9", status: "plan_to_watch" }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark Frieren as watching" }));
    });

    expect(addToLibraryAction).not.toHaveBeenCalled();
    expect(upsertProgress).toHaveBeenCalledWith("uuid-9", { status: "watching" });
  });

  it("keeps two copies of the same title in step (it can sit in two rows)", async () => {
    const pending = deferred<Awaited<ReturnType<typeof addToLibraryAction>>>();
    vi.mocked(addToLibraryAction).mockReturnValue(pending.promise);
    render(
      <>
        <DiscoverCard item={item} />
        <DiscoverCard item={item} />
      </>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Add Frieren to your library" })[0]!);

    expect(screen.getAllByText(/In library · Plan to Watch/)).toHaveLength(2);
    await act(async () => pending.resolve({ ok: true, alreadyAdded: false, animeId: "uuid-1" }));
  });
});

/**
 * Home-page adds used to go untracked: the event schema had no "home" source,
 * so the cards (and the banner, which shares these actions) never called
 * `track` — the busiest add surface was invisible in analytics.
 */
describe("DiscoverCard add tracking", () => {
  it("tracks a successful add as coming from home", async () => {
    vi.mocked(addToLibraryAction).mockResolvedValue({ ok: true, alreadyAdded: false, animeId: "uuid-1" });
    render(<DiscoverCard item={item} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Frieren to your library" }));
    });

    expect(track).toHaveBeenCalledExactlyOnceWith("anime_added", {
      malId: 52991,
      title: "Sousou no Frieren",
      source: "home",
    });
  });

  it("doesn't track an add that failed", async () => {
    vi.mocked(addToLibraryAction).mockResolvedValue({ ok: false, error: "You must be signed in." });
    render(<DiscoverCard item={item} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Frieren to your library" }));
    });

    expect(track).not.toHaveBeenCalled();
  });

  it("tracks the add that 'Mark watching' makes for a new title", async () => {
    vi.mocked(addToLibraryAction).mockResolvedValue({ ok: true, alreadyAdded: false, animeId: "uuid-1" });
    vi.mocked(upsertProgress).mockResolvedValue({ ok: true });
    render(<DiscoverCard item={item} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark Frieren as watching" }));
    });

    expect(track).toHaveBeenCalledExactlyOnceWith(
      "anime_added",
      expect.objectContaining({ malId: 52991, source: "home" }),
    );
  });

  it("doesn't count a status change on a title already in the library as an add", async () => {
    vi.mocked(upsertProgress).mockResolvedValue({ ok: true });
    render(<DiscoverCard item={item} entry={{ animeId: "uuid-9", status: "plan_to_watch" }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark Frieren as watching" }));
    });

    expect(track).not.toHaveBeenCalled();
  });
});
