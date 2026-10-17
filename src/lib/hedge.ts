/**
 * A hedged request: start `primary`; if it hasn't answered within `delayMs`,
 * start `backup` as well and take whichever succeeds first.
 *
 * The point is tail latency on interactive surfaces. Jikan is the search
 * engine of record but is slow (1–3s) and sometimes simply unreachable, while
 * AniList usually answers in well under a second. Plain sequential fallback
 * only tries AniList once Jikan has *failed* — after its full timeout — so a
 * slow-but-alive Jikan was the worst of both. Hedging caps the wait at
 * `delayMs` plus the backup's latency.
 *
 * It is not a doubling of upstream load: when the primary answers inside
 * `delayMs` (the normal case) the backup is never called, and `canHedge` lets
 * the caller veto the timed start (e.g. when the backup's own rate-limit queue
 * is backed up, so hedging would win nothing). A primary *failure* starts the
 * backup immediately regardless — that is just the ordinary fallback.
 *
 * Neither side is cancelled when the other wins. Both callers here sit on
 * caches, so a loser that finishes still warms the next request.
 */

export type Hedged<P, B> =
  | { winner: "primary"; value: P }
  | { winner: "backup"; value: B };

/** Both sides failed. Keeps each cause so callers can still branch on them. */
export class HedgeError extends Error {
  constructor(
    readonly primaryError: unknown,
    readonly backupError: unknown,
  ) {
    super("Both the primary and the backup request failed.");
    this.name = "HedgeError";
  }
}

/** Calls `fn`, turning a synchronous throw into a rejection. */
function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return fn();
  } catch (err) {
    return Promise.reject(err);
  }
}

/** How often a vetoed hedge asks `canHedge` again. */
const RECHECK_MS = 150;

export function hedge<P, B>(
  primary: () => Promise<P>,
  backup: () => Promise<B>,
  opts: {
    delayMs: number;
    /**
     * Asked when the delay lapses, and every `RECHECK_MS` after a "no" until
     * the primary settles. A veto postpones the hedge; it doesn't cancel it —
     * otherwise a backup that was briefly busy at the deadline would leave the
     * caller waiting out the primary's whole timeout.
     */
    canHedge?: () => boolean;
  },
): Promise<Hedged<P, B>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let backupStarted = false;
    let primaryFailed = false;
    let backupFailed = false;
    let primaryError: unknown;
    let backupError: unknown;

    const failIfBothFailed = () => {
      if (settled || !primaryFailed || !backupFailed) return;
      settled = true;
      reject(new HedgeError(primaryError, backupError));
    };

    let timer: ReturnType<typeof setTimeout> | undefined;

    const startBackup = () => {
      if (backupStarted || settled) return;
      backupStarted = true;
      clearTimeout(timer);
      attempt(backup).then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve({ winner: "backup", value });
        },
        (err: unknown) => {
          backupFailed = true;
          backupError = err;
          failIfBothFailed();
        },
      );
    };

    const tryHedge = () => {
      if (backupStarted || settled) return;
      if (!opts.canHedge || opts.canHedge()) startBackup();
      else timer = setTimeout(tryHedge, RECHECK_MS);
    };
    timer = setTimeout(tryHedge, opts.delayMs);

    attempt(primary).then(
      (value) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ winner: "primary", value });
      },
      (err: unknown) => {
        primaryFailed = true;
        primaryError = err;
        startBackup();
        failIfBothFailed();
      },
    );
  });
}
