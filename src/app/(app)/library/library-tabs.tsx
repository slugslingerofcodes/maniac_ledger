"use client";

import { useRouter } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = { value: string; label: string };

/**
 * Client tab bar for the library. Driven by the `?status=` URL param so the
 * server component can do the filtering: changing tab pushes a new URL, which
 * re-renders the server page and re-streams the grid.
 */
export function LibraryTabs({
  filters,
  current,
}: {
  filters: readonly Filter[];
  current: string;
}) {
  const router = useRouter();

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        const next = String(value);
        router.push(next === "all" ? "/library" : `/library?status=${next}`);
      }}
    >
      <TabsList>
        {filters.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
