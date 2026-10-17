"use client";

import { useState, type ReactNode } from "react";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  defaultShouldDehydrateQuery,
  QueryClient,
  type Query,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * What survives a reload. The ⌘K palette caches a query per debounced
 * keystroke (`["palette", …]`, `use-palette-search.ts`), each living ten
 * minutes — persisting them packed every save of the IndexedDB blob with
 * search results that are useless offline and stale by the next visit.
 * Everything else keeps TanStack's default (successful queries only), above
 * all `["user-library"]`, which is what the library shows offline.
 */
function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && query.queryKey[0] !== "palette";
}

/**
 * App-wide TanStack Query provider with the query cache persisted to IndexedDB.
 *
 * Note on packages: the brief named `@tanstack/query-sync-storage-persister`,
 * but that one targets *synchronous* storage (localStorage). IndexedDB is async,
 * so this uses the async persister backed by `idb-keyval`. `gcTime` must be >=
 * the persist `maxAge`, or a restored-but-inactive query gets garbage-collected
 * before it can be shown offline.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: ONE_DAY_MS,
            // Without a default staleTime every query refetches the instant a
            // component remounts, so leaving a page and coming back showed a
            // skeleton for data we already had. Five minutes makes a revisit
            // paint from cache; anything that must be fresh after a write
            // still invalidates its key explicitly.
            staleTime: FIVE_MIN_MS,
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  const [persistOptions] = useState(() => ({
    persister: createAsyncStoragePersister({
      key: "anitrack-query-cache",
      storage: {
        getItem: (key: string) => get<string>(key).then((v) => v ?? null),
        setItem: (key: string, value: string) => set(key, value),
        removeItem: (key: string) => del(key),
      },
    }),
    maxAge: ONE_DAY_MS,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  }));

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
