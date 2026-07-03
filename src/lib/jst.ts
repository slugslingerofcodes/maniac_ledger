/**
 * Japan Standard Time helpers for the schedule page. JST is UTC+9 with no DST,
 * so all math can be done with a fixed offset — no timezone library needed.
 *
 * Jikan's `broadcast.day` is a plural weekday ("Mondays") and `broadcast.time`
 * is "HH:MM" in Asia/Tokyo.
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const JST_DAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
] as const;

export type JstDay = (typeof JST_DAYS)[number];

/** A Date whose UTC fields read as JST wall-clock values. */
export function nowInJst(): Date {
  return new Date(Date.now() + JST_OFFSET_MS);
}

/** Today's Jikan-style weekday name in Japan (e.g. "Fridays"). */
export function todayInJst(): JstDay {
  return JST_DAYS[nowInJst().getUTCDay()];
}

/**
 * Epoch ms of the next occurrence of a weekly JST broadcast slot, or null when
 * the day/time is missing or unparsable. If this week's slot already passed,
 * rolls to next week.
 */
export function nextBroadcastMs(
  day: string | null,
  time: string | null,
): number | null {
  if (!day || !time) return null;
  const targetDow = JST_DAYS.indexOf(day as JstDay);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (targetDow === -1 || !m) return null;

  const hours = Number(m[1]);
  const minutes = Number(m[2]);

  const jstNow = nowInJst();
  const candidate = new Date(jstNow);
  candidate.setUTCDate(
    candidate.getUTCDate() + ((targetDow - jstNow.getUTCDay() + 7) % 7),
  );
  candidate.setUTCHours(hours, minutes, 0, 0);
  if (candidate.getTime() <= jstNow.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }

  // candidate is in "JST wall-clock as UTC" space; shift back to real epoch.
  return candidate.getTime() - JST_OFFSET_MS;
}

/** "2d 05:12:33"-style remaining time, or null once the moment has passed. */
export function formatRemaining(untilMs: number): string | null {
  let diff = Math.floor((untilMs - Date.now()) / 1000);
  if (diff < 0) return null;
  const days = Math.floor(diff / 86_400);
  diff -= days * 86_400;
  const h = String(Math.floor(diff / 3600)).padStart(2, "0");
  diff %= 3600;
  const mm = String(Math.floor(diff / 60)).padStart(2, "0");
  const ss = String(diff % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${h}:${mm}:${ss}` : `${h}:${mm}:${ss}`;
}
