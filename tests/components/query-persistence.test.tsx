// @vitest-environment jsdom
import { useIsRestoring, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the app's query cache writes to IndexedDB.
 *
 * The ⌘K palette caches one query per debounced keystroke under
 * `["palette", …]`; persisting those rewrote the stored blob on every keystroke
 * for results nobody needs offline. The library list, by contrast, *must*
 * persist — it is what /library renders with no connection. These tests read
 * the blob the real `Providers` hands to storage, so they also catch the
 * filter being dropped from the persister's options, not just a wrong filter.
 */

const STORAGE_KEY = "anitrack-query-cache";
const idb = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idb.store.get(key)),
  set: vi.fn(async (key: string, value: string) => {
    idb.store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idb.store.delete(key);
  }),
}));

const { Providers } = await import("@/app/providers");

afterEach(cleanup);
beforeEach(() => {
  idb.store.clear();
});

/**
 * Mounts the real provider and hands back its QueryClient once the restore
 * (from an empty store) is done — the persister only subscribes to the cache
 * after that, so earlier writes would never be saved.
 */
async function mountProviders(): Promise<QueryClient> {
  let client: QueryClient | undefined;
  let restoring = true;
  function Grab() {
    client = useQueryClient();
    restoring = useIsRestoring();
    return null;
  }
  render(
    <Providers>
      <Grab />
    </Providers>,
  );
  await waitFor(() => expect(restoring).toBe(false));
  await act(async () => {});
  return client!;
}

/** Query keys in the blob as last saved (`[]` before the first save). */
function persistedKeys(): unknown[] {
  const raw = idb.store.get(STORAGE_KEY);
  if (!raw) return [];
  const blob = JSON.parse(raw) as {
    clientState: { queries: { queryKey: unknown[] }[] };
  };
  return blob.clientState.queries.map((q) => q.queryKey);
}

/**
 * The persister saves on the first cache event (before any data lands) and
 * then at most once a second, so assertions wait for the save that follows.
 */
const eventually = (assertion: () => void) => waitFor(assertion, { timeout: 4_000 });

describe("query persistence", () => {
  it("persists the library list but not the palette's search results", async () => {
    const client = await mountProviders();

    client.setQueryData(["user-library"], [{ id: "1", title: "Frieren" }]);
    client.setQueryData(["palette", "anime", "fri"], [{ malId: 52991 }]);
    client.setQueryData(["palette", "anime-catalog", "fri"], [{ malId: 52991 }]);
    client.setQueryData(["palette", "manga", "fri"], []);

    await eventually(() => expect(persistedKeys()).toEqual([["user-library"]]));
  });

  it("still persists other queries, and only successful ones", async () => {
    // A filter that only checked the palette prefix would drop TanStack's
    // default and start persisting failures too.
    const client = await mountProviders();

    client.setQueryData(["user-library"], []);
    client.setQueryData(["calendar-feed"], { url: "webcal://x" });
    await client
      .prefetchQuery({
        queryKey: ["broken"],
        queryFn: () => Promise.reject(new Error("upstream down")),
      })
      .catch(() => {});

    await eventually(() =>
      expect(persistedKeys()).toEqual(
        expect.arrayContaining([["user-library"], ["calendar-feed"]]),
      ),
    );
    expect(persistedKeys()).not.toContainEqual(["broken"]);
  });
});
