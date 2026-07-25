// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JikanManga } from "@/lib/jikan";

// The card imports server actions and TanStack Query through its add-button
// and the library grid's exported query key — neither matters here.
vi.mock("@/app/actions/manga", () => ({
  addMangaToLibraryAction: vi.fn(),
  getUserMangaLibrary: vi.fn(),
  removeFromMangaLibraryAction: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const { MangaPosterCard } = await import("@/components/manga/MangaPosterCard");

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

const manga = {
  mal_id: 13,
  mangadex_id: null,
  title: "One Piece",
  title_english: "One Piece",
  images: {
    jpg: {
      image_url: "https://uploads.mangadex.org/covers/x/y.jpg",
      large_image_url: "https://uploads.mangadex.org/covers/x/y.jpg.512.jpg",
    },
  },
  score: 9.2,
} as unknown as JikanManga;

/**
 * MangaDex's CDN swaps in a "you can read this at MangaDex" placeholder for
 * any request carrying a foreign Referer (verified live: same URL, 59 KB
 * placeholder with a Referer vs 165 KB cover without). The only defense is
 * the referrerPolicy attribute on the cover <img> — nothing errors when it's
 * missing, the grid just quietly fills with placeholder cards.
 */
describe("MangaPosterCard", () => {
  it("requests covers with no Referer so MangaDex serves art, not its hotlink placeholder", () => {
    const { container } = render(<MangaPosterCard manga={manga} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
