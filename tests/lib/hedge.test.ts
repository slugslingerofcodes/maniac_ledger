import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hedge, HedgeError } from "@/lib/hedge";

/**
 * Hedged requests: start the primary; if it hasn't answered by `delayMs`,
 * race the backup alongside it.
 *
 * The property most worth pinning is the *non*-event: a primary that answers
 * inside the delay must never call the backup. Hedging exists to cut tail
 * latency; if it fired on every request it would double load on AniList, the
 * upstream with the tightest budget (30/min) in the app.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A promise settled by hand, to play an upstream at a chosen moment. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("hedge", () => {
  it("never calls the backup when the primary answers inside the delay", async () => {
    const backup = vi.fn(() => Promise.resolve("backup"));
    // A healthy-but-not-instant upstream: answers at 500ms, inside the delay.
    const primary = () =>
      new Promise<string>((resolve) => setTimeout(() => resolve("primary"), 500));

    const result = hedge(primary, backup, { delayMs: 1_200 });
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual({ winner: "primary", value: "primary" });
    expect(backup).not.toHaveBeenCalled();
  });

  it("starts the backup at the delay and takes it when the primary is slow", async () => {
    const primary = deferred<string>();
    const backup = vi.fn(() => Promise.resolve("backup"));

    const result = hedge(() => primary.promise, backup, { delayMs: 1_200 });
    await vi.advanceTimersByTimeAsync(1_199);
    expect(backup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ winner: "backup", value: "backup" });
  });

  it("starts the backup at once when the primary fails early — plain fallback", async () => {
    const backup = vi.fn(() => Promise.resolve("backup"));

    const result = hedge(() => Promise.reject(new Error("down")), backup, {
      delayMs: 1_200,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(backup).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual({ winner: "backup", value: "backup" });
  });

  it("still takes a primary that lands after the backup started but first", async () => {
    const primary = deferred<string>();
    const backupCall = deferred<string>();

    const result = hedge(() => primary.promise, () => backupCall.promise, {
      delayMs: 1_200,
    });
    await vi.advanceTimersByTimeAsync(1_200);
    primary.resolve("primary");

    await expect(result).resolves.toEqual({ winner: "primary", value: "primary" });
  });

  it("waits for the primary when the backup fails", async () => {
    const primary = deferred<string>();

    const result = hedge(() => primary.promise, () => Promise.reject(new Error("x")), {
      delayMs: 1_200,
    });
    await vi.advanceTimersByTimeAsync(1_500);
    primary.resolve("late primary");

    await expect(result).resolves.toEqual({ winner: "primary", value: "late primary" });
  });

  it("rejects with both causes when both fail", async () => {
    const primaryErr = new Error("jikan");
    const backupErr = new Error("anilist");

    const result = hedge(
      () => Promise.reject(primaryErr),
      () => Promise.reject(backupErr),
      { delayMs: 1_200 },
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);

    const err = await result;
    expect(err).toBeInstanceOf(HedgeError);
    expect((err as HedgeError).primaryError).toBe(primaryErr);
    expect((err as HedgeError).backupError).toBe(backupErr);
  });

  it("turns a synchronous throw into a failure rather than escaping", async () => {
    const result = hedge(
      () => {
        throw new Error("sync");
      },
      () => Promise.resolve("backup"),
      { delayMs: 1_200 },
    );
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).resolves.toEqual({ winner: "backup", value: "backup" });
  });

  describe("canHedge", () => {
    it("postpones a vetoed hedge rather than dropping it", async () => {
      // A backup that was briefly busy at the deadline must not leave the
      // caller waiting out the primary's whole timeout.
      const primary = deferred<string>();
      const backup = vi.fn(() => Promise.resolve("backup"));
      let ready = false;

      const result = hedge(() => primary.promise, backup, {
        delayMs: 1_200,
        canHedge: () => ready,
      });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(backup).not.toHaveBeenCalled();

      ready = true;
      await vi.advanceTimersByTimeAsync(200);

      await expect(result).resolves.toEqual({ winner: "backup", value: "backup" });
    });

    it("never vetoes the fallback after a primary failure", async () => {
      const backup = vi.fn(() => Promise.resolve("backup"));

      const result = hedge(() => Promise.reject(new Error("down")), backup, {
        delayMs: 1_200,
        canHedge: () => false,
      });
      await vi.advanceTimersByTimeAsync(0);

      await expect(result).resolves.toEqual({ winner: "backup", value: "backup" });
    });

    it("stops re-checking once the primary answers", async () => {
      const primary = deferred<string>();
      const canHedge = vi.fn(() => false);

      const result = hedge(() => primary.promise, () => Promise.resolve("b"), {
        delayMs: 1_200,
        canHedge,
      });
      await vi.advanceTimersByTimeAsync(1_500);
      primary.resolve("primary");
      await result;
      const checks = canHedge.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);

      expect(canHedge.mock.calls.length).toBe(checks);
    });
  });
});
