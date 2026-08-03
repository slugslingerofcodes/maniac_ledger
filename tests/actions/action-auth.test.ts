import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authentication guards on the Server Actions that proxy paid or rate-limited
 * third parties.
 *
 * These three shipped with no auth check at all. It's an easy assumption to
 * make — the proxy redirects signed-out visitors, so the pages look protected —
 * but action IDs resolve from a global manifest, so an action can be dispatched
 * by POSTing to *any* route, including the public `/login`. Next's own docs are
 * explicit: "treat Server Actions as reachable via direct POST requests and
 * verify authentication and authorization inside each one."
 *
 * `parseNaturalQuery` is the one that costs money — every call is a billable
 * Gemini request. The other two drain upstream rate-limit budget the whole app
 * shares.
 *
 * The test that matters is not "does it work when signed in" but "does the
 * upstream stay untouched when signed out" — an action that checks auth *after*
 * doing the expensive thing is no protection at all.
 */

const unauthenticated = () => {
  throw new Error("NEXT_REDIRECT");
};

vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn(unauthenticated) }));

// Every upstream the three actions can reach. All must stay untouched.
vi.mock("@/lib/jikan", () => ({
  searchAnime: vi.fn(),
  getTopAnime: vi.fn(),
  getAnimePictures: vi.fn(),
}));
vi.mock("@/lib/anilist", () => ({ searchAnilist: vi.fn() }));
vi.mock("@/lib/catalog-fallback", () => ({
  searchCatalog: vi.fn(),
  browseCatalog: vi.fn(),
}));

const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

const fetchSpy = vi.fn();

const { requireUser } = await import("@/lib/supabase/auth");
const { searchAnime, getTopAnime } = await import("@/lib/jikan");
const { searchAnilist } = await import("@/lib/anilist");
const { browseCatalog } = await import("@/lib/catalog-fallback");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockImplementation(unauthenticated);
  vi.stubGlobal("fetch", fetchSpy);
  process.env.GEMINI_API_KEY = "test-key";
});

describe("server actions reject anonymous callers before spending anything", () => {
  it("parseNaturalQuery never reaches Gemini", async () => {
    const { parseNaturalQuery } = await import("@/app/actions/nl-search");

    await expect(parseNaturalQuery("something like Frieren")).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    // Both halves matter: the guard ran, and it ran *before* the billable call.
    expect(vi.mocked(requireUser)).toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("fetchAnimePosters never reaches MAL, AniList or the catalog", async () => {
    const { fetchAnimePosters } = await import("@/app/actions/posters");

    await expect(fetchAnimePosters("frieren")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(searchAnime).not.toHaveBeenCalled();
    expect(getTopAnime).not.toHaveBeenCalled();
    expect(searchAnilist).not.toHaveBeenCalled();
    expect(browseCatalog).not.toHaveBeenCalled();
  });

  it("the arts actions never reach their third-party APIs", async () => {
    const { fetchAnimeArts, fetchFanArts } = await import("@/app/actions/arts");

    await expect(fetchAnimeArts("hug", 5)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(fetchFanArts("frieren")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
