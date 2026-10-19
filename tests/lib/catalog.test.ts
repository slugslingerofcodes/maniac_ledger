import { beforeEach, describe, expect, it, vi } from "vitest";

import { RPC_NOT_FOUND } from "../helpers/supabase";

/**
 * The chart reader every home rail tries first (`src/lib/catalog.ts`): one
 * `catalog_list` RPC per chart, freshness enforced by the database.
 *
 * Its contract with the rails is "[] means no usable snapshot, ask the next
 * tier" — so every failure mode (no migration, a broken answer, a thrown
 * client) has to come out as [], never as an exception that blanks a rail or
 * a stale list passed off as fresh.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { __resetCatalogListMemo, getCatalogList, getStaleCatalogList, FRESH_MAX_AGE, STALE_MAX_AGE } =
  await import("@/lib/catalog");

function withRpc(result: unknown) {
  const rpc = vi.fn(async () => result);
  vi.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<
    ReturnType<typeof createClient>
  >);
  return rpc;
}

const syncedRow = (malId: number, title: string) => ({
  id: `uuid-${malId}`,
  mal_id: malId,
  title,
  title_english: null,
  synopsis: null,
  poster_url: null,
  score: 8.5,
  studio: null,
  total_episodes: 12,
  status: "currently_airing",
  season: "fall",
  year: 2026,
  type: "tv",
  genres: ["Action"],
  title_synonyms: [],
  banner_url: "https://s4.anilist.co/banner.jpg",
  trailer_youtube_id: "abcdefgh123",
  members: 500_000,
  duration_mins: 24,
  broadcast_day: "Saturdays",
  broadcast_time: "23:00",
  airing_start: "2026-10-03",
  airing_end: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  __resetCatalogListMemo();
});

describe("getCatalogList", () => {
  it("asks for one chart, sized and with the freshness bar", async () => {
    const rpc = withRpc({ data: [], error: null });

    await getCatalogList("airing", 24);

    expect(rpc).toHaveBeenCalledWith("catalog_list", {
      list_key: "airing",
      max_results: 24,
      max_age: FRESH_MAX_AGE,
    });
  });

  it("keeps the chart's order and carries what the banner needs", async () => {
    withRpc({ data: [syncedRow(2, "Second"), syncedRow(1, "First")], error: null });

    const list = await getCatalogList("airing");

    expect(list.map((a) => a.title)).toEqual(["Second", "First"]);
    expect(list[0]).toMatchObject({
      banner_image: "https://s4.anilist.co/banner.jpg",
      trailer: { youtube_id: "abcdefgh123" },
      broadcast: { day: "Saturdays", time: "23:00" },
      duration: "24 min per ep",
      status: "Currently Airing",
    });
  });

  it("lowers the bar to a month for the last-resort tier", async () => {
    const rpc = withRpc({ data: [], error: null });

    await getStaleCatalogList("upcoming", 10);

    expect(rpc).toHaveBeenCalledWith("catalog_list", expect.objectContaining({ max_age: STALE_MAX_AGE }));
  });

  it.each([
    ["the RPC is missing (0030 not applied)", RPC_NOT_FOUND],
    ["the RPC errors", { data: null, error: { code: "57014", message: "timeout" } }],
    ["the answer isn't an array", { data: { rows: [] }, error: null }],
  ])("returns [] when %s", async (_label, result) => {
    withRpc(result);

    await expect(getCatalogList("popular")).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the client itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createClient).mockRejectedValue(new Error("cookies() outside a request"));

    await expect(getCatalogList("popular")).resolves.toEqual([]);
  });

  it("stops asking for an RPC the database doesn't have", async () => {
    const rpc = withRpc(RPC_NOT_FOUND);

    await getCatalogList("popular");
    await getCatalogList("airing");

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
