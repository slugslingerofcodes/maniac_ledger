import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

/**
 * The window math and the memory cap. The route-level behavior (429 body,
 * headers, per-IP keys) lives in tests/api/anime-search.test.ts; this file
 * pins the primitive itself so a future "one-line tweak" can't silently turn
 * the limiter into a no-op (always-allow) or a lockout (never-reset).
 */

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows exactly `limit` calls per window, then refuses", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", 5, 60_000).ok).toBe(true);
    }
    expect(checkRateLimit("k", 5, 60_000).ok).toBe(false);
  });

  it("reports how long to back off, in whole seconds", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    vi.advanceTimersByTime(30_000);

    const refused = checkRateLimit("k", 5, 60_000);

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBe(30);
  });

  it("opens a fresh window once the old one expires", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    expect(checkRateLimit("k", 5, 60_000).ok).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit("k", 5, 60_000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);

    expect(checkRateLimit("a", 5, 60_000).ok).toBe(false);
    expect(checkRateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("caps tracked keys, evicting the oldest, so key-rotation can't grow memory forever", () => {
    // Overflow the cap by one: key-0 is the oldest and must be evicted…
    for (let i = 0; i <= 5_000; i++) checkRateLimit(`key-${i}`, 1, 60_000);

    // …so key-0 is treated as brand new (allowed) instead of remembered
    // (it had exhausted its limit of 1), while a recent key stays remembered.
    expect(checkRateLimit("key-0", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("key-5000", 1, 60_000).ok).toBe(false);
  });
});
