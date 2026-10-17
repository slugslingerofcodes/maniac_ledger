import { describe, expect, it } from "vitest";

import { getPaletteRecentsServerSnapshot } from "@/lib/command-palette";

/**
 * useSyncExternalStore compares snapshots by identity. A server snapshot that
 * returns a fresh `[]` each call is reported by React as a would-be infinite
 * loop — it surfaced as a Console Error on every page, from the palette that
 * the app layout mounts everywhere.
 */
describe("getPaletteRecentsServerSnapshot", () => {
  it("returns the same array on every call", () => {
    expect(getPaletteRecentsServerSnapshot()).toBe(getPaletteRecentsServerSnapshot());
  });

  it("is empty — the server has no localStorage to read recents from", () => {
    expect(getPaletteRecentsServerSnapshot()).toEqual([]);
  });
});
