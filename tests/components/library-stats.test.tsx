// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LibraryStats } from "@/components/library/LibraryStats";
import type { LibraryStatsInput } from "@/lib/library-stats";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * The bar the library search shows above the grid. These check what a reader
 * sees — the numbers in their tiles, the meter's accessible values, and the
 * status counts — rather than re-testing the arithmetic.
 */

function entry(overrides: Partial<LibraryStatsInput> = {}): LibraryStatsInput {
  return {
    status: "watching",
    episodesWatched: 0,
    totalEpisodes: 12,
    score: null,
    ...overrides,
  };
}

/** The value shown under a tile's label. */
function tileValue(label: string): string {
  const dt = screen.getByText(label, { selector: "dt" });
  return dt.nextElementSibling?.firstElementChild?.textContent ?? "";
}

describe("LibraryStats", () => {
  it("shows the matched count against the whole library", () => {
    render(<LibraryStats items={[entry(), entry()]} libraryTotal={87} />);
    expect(tileValue("Titles")).toBe("2");
    expect(screen.getByText("of 87 in library")).toBeTruthy();
    expect(screen.getByText("2 of 87 titles match.")).toBeTruthy();
  });

  it("puts episodes, completion and mean score in their tiles", () => {
    render(
      <LibraryStats
        items={[
          entry({ episodesWatched: 6, totalEpisodes: 12, score: 9 }),
          entry({ episodesWatched: 12, totalEpisodes: 12, score: 7, status: "completed" }),
        ]}
        libraryTotal={10}
      />,
    );
    expect(tileValue("Episodes watched")).toBe("18");
    expect(screen.getByText("75% of 24 episodes")).toBeTruthy();
    expect(tileValue("Mean score")).toBe("8.0");
    expect(screen.getByText("from 2 rated")).toBeTruthy();

    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("18");
    expect(meter.getAttribute("aria-valuemax")).toBe("24");
  });

  it("drops the meter when no matched title has a known length", () => {
    render(
      <LibraryStats items={[entry({ episodesWatched: 40, totalEpisodes: null })]} libraryTotal={1} />,
    );
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByText("length not known yet")).toBeTruthy();
    expect(tileValue("Mean score")).toBe("—");
  });

  it("labels each status count in text, not color alone", () => {
    render(
      <LibraryStats
        items={[entry(), entry({ status: "completed" }), entry({ status: "completed" })]}
        libraryTotal={3}
      />,
    );
    const list = screen.getByRole("list", { name: "Titles by status" });
    const rows = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["Watching1", "Completed2"]);
  });
});
