import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  JST_OFFSET_MS,
  formatRemaining,
  nextBroadcastMs,
  nowInJst,
  todayInJst,
} from "@/lib/jst";

/**
 * Japan-time broadcast math for the schedule page.
 *
 * Pure functions, but the kind that fail quietly: an off-by-one in the weekday
 * rollover just shows the wrong countdown, and nothing crashes. Tests run
 * against a frozen clock so "next Saturday" is a fixed, checkable answer.
 */

/** 2024-03-15T12:00:00Z — a Friday. In JST that's Friday 21:00. */
const FRIDAY_NOON_UTC = new Date("2024-03-15T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FRIDAY_NOON_UTC);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nowInJst", () => {
  it("shifts UTC forward by nine hours", () => {
    expect(nowInJst().getTime()).toBe(FRIDAY_NOON_UTC.getTime() + JST_OFFSET_MS);
  });

  it("reads as JST wall-clock through the UTC getters", () => {
    // 12:00 UTC is 21:00 in Tokyo.
    expect(nowInJst().getUTCHours()).toBe(21);
  });
});

describe("todayInJst", () => {
  it("returns the Jikan-style weekday name", () => {
    expect(todayInJst()).toBe("Fridays");
  });

  it("is already tomorrow in Japan late in the UTC evening", () => {
    // 16:00 UTC Friday = 01:00 Saturday in Tokyo — the case a naive UTC
    // weekday lookup gets wrong.
    vi.setSystemTime(new Date("2024-03-15T16:00:00Z"));

    expect(todayInJst()).toBe("Saturdays");
  });

  it("is still yesterday in Japan just after UTC midnight", () => {
    // 00:30 UTC Saturday = 09:30 Saturday JST; but 14:30 UTC Fri = 23:30 Fri.
    vi.setSystemTime(new Date("2024-03-15T14:30:00Z"));

    expect(todayInJst()).toBe("Fridays");
  });
});

describe("nextBroadcastMs", () => {
  it("returns null without a day", () => {
    expect(nextBroadcastMs(null, "23:00")).toBeNull();
  });

  it("returns null without a time", () => {
    expect(nextBroadcastMs("Saturdays", null)).toBeNull();
  });

  it("returns null for an unknown weekday", () => {
    expect(nextBroadcastMs("Someday", "23:00")).toBeNull();
  });

  it.each(["11pm", "23", "23:0", "abc", "", "2300"])(
    "returns null for unparsable time %o",
    (time) => {
      expect(nextBroadcastMs("Saturdays", time)).toBeNull();
    },
  );

  it("finds tomorrow's slot", () => {
    // Now: Fri 21:00 JST. Next Saturday 23:00 JST = Sat 14:00 UTC.
    const at = nextBroadcastMs("Saturdays", "23:00");

    expect(new Date(at!).toISOString()).toBe("2024-03-16T14:00:00.000Z");
  });

  it("finds a slot later the same day", () => {
    // Now: Fri 21:00 JST; 23:30 JST today is still ahead.
    const at = nextBroadcastMs("Fridays", "23:30");

    expect(new Date(at!).toISOString()).toBe("2024-03-15T14:30:00.000Z");
  });

  it("rolls to next week when today's slot already passed", () => {
    // Now: Fri 21:00 JST; 09:00 JST was this morning ⇒ next Friday.
    const at = nextBroadcastMs("Fridays", "09:00");

    expect(new Date(at!).toISOString()).toBe("2024-03-22T00:00:00.000Z");
  });

  it("rolls forward when the slot is exactly now", () => {
    // A slot at this exact minute has aired, so the *next* one is next week.
    const at = nextBroadcastMs("Fridays", "21:00");

    expect(new Date(at!).toISOString()).toBe("2024-03-22T12:00:00.000Z");
  });

  it("wraps around the week for an earlier weekday", () => {
    // Now: Friday. Monday is 3 days out, not 4 days back.
    const at = nextBroadcastMs("Mondays", "23:00");

    expect(new Date(at!).toISOString()).toBe("2024-03-18T14:00:00.000Z");
  });

  it("handles a post-midnight JST slot", () => {
    // Late-night anime air at e.g. Sat 01:30 JST = Fri 16:30 UTC.
    const at = nextBroadcastMs("Saturdays", "01:30");

    expect(new Date(at!).toISOString()).toBe("2024-03-15T16:30:00.000Z");
  });

  it("accepts a single-digit hour", () => {
    const at = nextBroadcastMs("Saturdays", "9:00");

    expect(new Date(at!).toISOString()).toBe("2024-03-16T00:00:00.000Z");
  });

  it("always returns a moment in the future", () => {
    for (const day of ["Sundays", "Mondays", "Fridays", "Saturdays"]) {
      expect(nextBroadcastMs(day, "12:00")!).toBeGreaterThan(Date.now());
    }
  });

  it("never returns a slot more than a week out", () => {
    const week = 7 * 24 * 60 * 60 * 1000;

    for (const day of ["Sundays", "Wednesdays", "Saturdays"]) {
      expect(nextBroadcastMs(day, "12:00")! - Date.now()).toBeLessThanOrEqual(week);
    }
  });
});

describe("formatRemaining", () => {
  it("returns null once the moment has passed", () => {
    expect(formatRemaining(Date.now() - 1000)).toBeNull();
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatRemaining(Date.now() + 3_723_000)).toBe("01:02:03");
  });

  it("includes days once past 24 hours", () => {
    const twoDays = 2 * 86_400_000 + 5 * 3_600_000 + 12 * 60_000 + 33_000;

    expect(formatRemaining(Date.now() + twoDays)).toBe("2d 05:12:33");
  });

  it("zero-pads each field", () => {
    expect(formatRemaining(Date.now() + 61_000)).toBe("00:01:01");
  });

  it("renders the moment itself as zeroes, not null", () => {
    expect(formatRemaining(Date.now())).toBe("00:00:00");
  });

  it("drops the day field at exactly 24 hours", () => {
    expect(formatRemaining(Date.now() + 86_400_000)).toBe("1d 00:00:00");
  });
});
