import { describe, expect, it } from "vitest";

import {
  buildAiringCalendar,
  escapeIcsText,
  foldIcsLine,
  type AiringShow,
} from "@/app/api/calendar/ics";

/**
 * The .ics serializer behind "Add to calendar".
 *
 * Nothing here is visible to a typecheck, and almost none of it is visible to a
 * human either: calendar apps silently drop or mangle an event whose line is
 * too long, whose title has an unescaped comma, or whose start lands on the
 * wrong day. The JST arithmetic is the sharpest edge — Japan is UTC+9, so for
 * nine hours of every day the JST date is a day ahead of the UTC one, and a
 * weekday computed from the wrong clock puts a Sunday-night show on Saturday.
 */

// 2026-10-14 is a Wednesday. 03:00 UTC = Wednesday 12:00:00 JST.
const WED_NOON_JST = new Date("2026-10-14T03:00:00Z");

/** Undo RFC 5545 line folding: a CRLF followed by one space is a continuation. */
function unfold(ics: string) {
  return ics.replace(/\r\n /g, "");
}

/** The logical (unfolded) content lines, without the trailing empty string. */
function contentLines(ics: string) {
  return unfold(ics).split("\r\n").filter((line) => line !== "");
}

/** The physical lines exactly as written to the file. */
function physicalLines(ics: string) {
  return ics.split("\r\n").filter((line) => line !== "");
}

function octets(line: string) {
  return Buffer.byteLength(line, "utf8");
}

/** Each VEVENT block as its logical lines. */
function events(ics: string) {
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of contentLines(ics)) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      out.push(current);
      current = null;
    } else if (current) current.push(line);
  }
  return out;
}

/** The value of `name` within one event's lines (matches `NAME:` and `NAME;params:`). */
function prop(event: string[], name: string) {
  const line = event.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
  return line?.slice(line.indexOf(":") + 1);
}

function show(overrides: Partial<AiringShow> = {}): AiringShow {
  return { malId: 52991, title: "Sousou no Frieren", day: "Fridays", time: "23:00", ...overrides };
}

/** DTSTART of the single event built for one show at `now`. */
function startOf(day: string, time: string, now: Date) {
  const [event] = events(buildAiringCalendar([show({ day, time })], now));
  expect(event, `no VEVENT built for ${day} ${time}`).toBeDefined();
  return event.find((l) => l.startsWith("DTSTART"));
}

describe("escapeIcsText", () => {
  it.each([
    ["backslash", "a\\b", "a\\\\b"],
    ["semicolon", "a;b", "a\\;b"],
    ["comma", "a,b", "a\\,b"],
    ["LF", "a\nb", "a\\nb"],
    ["CR", "a\rb", "a\\nb"],
  ])("escapes a %s", (_name, input, expected) => {
    expect(escapeIcsText(input)).toBe(expected);
  });

  it("collapses a CRLF into a single escaped newline, not two", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
  });

  it("escapes backslashes first, so it doesn't re-escape its own output", () => {
    // `\;` → `\\` + `\;`. Escaping `;` first would yield `\\\\;` — four
    // backslashes, which a calendar reads back as a literal `\\;`.
    expect(escapeIcsText("\\;")).toBe("\\\\\\;");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeIcsText("a,b,c;d;e")).toBe("a\\,b\\,c\\;d\\;e");
  });

  it("leaves ordinary title text alone (colons are not escaped in TEXT)", () => {
    expect(escapeIcsText("Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season")).toBe(
      "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season",
    );
    expect(escapeIcsText("葬送のフリーレン")).toBe("葬送のフリーレン");
  });
});

describe("foldIcsLine", () => {
  /** No physical line over 75 octets, and every continuation starts with one space. */
  function expectWellFolded(folded: string, original: string) {
    const lines = folded.split("\r\n");
    for (const line of lines) {
      expect(octets(line), `line over 75 octets: ${JSON.stringify(line)}`).toBeLessThanOrEqual(75);
    }
    for (const continuation of lines.slice(1)) {
      expect(continuation.startsWith(" ")).toBe(true);
    }
    // No bare LF/CR smuggled in alongside the CRLFs.
    expect(folded.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(unfold(folded)).toBe(original);
    return lines;
  }

  it("leaves a 75-octet line unchanged", () => {
    const line = `SUMMARY:${"a".repeat(67)}`;
    expect(octets(line)).toBe(75);

    expect(foldIcsLine(line)).toBe(line);
  });

  it("leaves a short line unchanged", () => {
    expect(foldIcsLine("VERSION:2.0")).toBe("VERSION:2.0");
  });

  it("folds a 76-octet line into exactly two physical lines", () => {
    const line = `SUMMARY:${"a".repeat(68)}`;

    const lines = expectWellFolded(foldIcsLine(line), line);

    expect(lines).toHaveLength(2);
  });

  it("folds a long ASCII line so every physical line fits, counting the leading space", () => {
    const line = `SUMMARY:${"Frieren ".repeat(40)}`.trimEnd();

    const lines = expectWellFolded(foldIcsLine(line), line);

    expect(lines.length).toBeGreaterThan(3);
  });

  it("folds a long Japanese title by octets, not characters, and never splits a character", () => {
    // 3 octets per kana/kanji: 75 *characters* would be ~225 octets. "SUMMARY:"
    // is 8 octets, so the 75-octet boundary falls mid-character (67 / 3).
    const line = `SUMMARY:${"葬送のフリーレン".repeat(12)}`;

    const lines = expectWellFolded(foldIcsLine(line), line);

    expect(lines.length).toBeGreaterThan(1);
    for (const physical of lines) {
      expect(physical).not.toContain("�");
    }
  });

  it.each([0, 1, 2, 3])(
    "never splits a surrogate pair (4-octet characters, %i-octet offset)",
    (pad) => {
      // Splitting between the halves of an astral character would still unfold
      // to the original string, so check each physical line on its own. The
      // offsets move the 75-octet boundary around: a folder that walks UTF-16
      // units can land between whole pairs at one offset and mid-pair at another.
      const line = `SUMMARY:${"a".repeat(pad)}${"🎌".repeat(40)}`;

      const lines = expectWellFolded(foldIcsLine(line), line);

      for (const physical of lines) {
        expect(physical.isWellFormed(), `lone surrogate in ${JSON.stringify(physical)}`).toBe(true);
        expect(physical).not.toContain("�");
      }
    },
  );

  it("handles a mix of 1-, 2-, 3- and 4-octet characters", () => {
    const line = `SUMMARY:${"aé葬🎌".repeat(30)}`;

    const lines = expectWellFolded(foldIcsLine(line), line);

    for (const physical of lines) expect(physical.isWellFormed()).toBe(true);
  });
});

describe("buildAiringCalendar — document structure", () => {
  it("emits the calendar header, the JST VTIMEZONE and one VEVENT, in order", () => {
    const ics = buildAiringCalendar([show({ day: "Fridays", time: "23:00" })], WED_NOON_JST);

    expect(contentLines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//anime_maniacs//Airing Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:anime_maniacs — Watching",
      "X-WR-TIMEZONE:Asia/Tokyo",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Tokyo",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900",
      "TZOFFSETTO:+0900",
      "TZNAME:JST",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:mal-52991@anime-maniacs",
      "DTSTAMP:20261014T030000Z",
      "DTSTART;TZID=Asia/Tokyo:20261016T230000",
      "DURATION:PT30M",
      "RRULE:FREQ=WEEKLY",
      "SUMMARY:Sousou no Frieren",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("uses CRLF line endings throughout, with a trailing CRLF", () => {
    const ics = buildAiringCalendar(
      [show({ title: "Line one\nLine two" }), show({ malId: 2, title: "x".repeat(200) })],
      WED_NOON_JST,
    );

    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // Strip every CRLF: anything left over is a bare LF or CR.
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("folds every line it writes, including long Japanese titles", () => {
    const title = "葬送のフリーレン 第2期 ".repeat(8).trim();
    const ics = buildAiringCalendar([show({ title })], WED_NOON_JST);

    for (const line of physicalLines(ics)) {
      expect(octets(line), `line over 75 octets: ${JSON.stringify(line)}`).toBeLessThanOrEqual(75);
      expect(line.isWellFormed()).toBe(true);
    }
    expect(prop(events(ics)[0], "SUMMARY")).toBe(title);
  });

  it("escapes the title in SUMMARY", () => {
    const ics = buildAiringCalendar(
      [show({ title: "Re:Zero, Season 3; Part 1\\2" })],
      WED_NOON_JST,
    );

    expect(prop(events(ics)[0], "SUMMARY")).toBe("Re:Zero\\, Season 3\\; Part 1\\\\2");
  });

  it("stamps DTSTAMP with `now` in UTC", () => {
    const ics = buildAiringCalendar([show()], new Date("2026-10-14T03:04:05Z"));

    expect(prop(events(ics)[0], "DTSTAMP")).toBe("20261014T030405Z");
  });

  it("emits one VEVENT per show, in input order, keyed by MAL id", () => {
    const ics = buildAiringCalendar(
      [
        show({ malId: 3, title: "Third", day: "Mondays" }),
        show({ malId: 1, title: "First", day: "Sundays" }),
        show({ malId: 2, title: "Second", day: "Thursdays" }),
      ],
      WED_NOON_JST,
    );

    expect(events(ics).map((e) => prop(e, "UID"))).toEqual([
      "mal-3@anime-maniacs",
      "mal-1@anime-maniacs",
      "mal-2@anime-maniacs",
    ]);
    expect(events(ics).map((e) => prop(e, "SUMMARY"))).toEqual(["Third", "First", "Second"]);
  });

  it("keeps the first of duplicate MAL ids", () => {
    const ics = buildAiringCalendar(
      [
        show({ malId: 7, title: "Kept", day: "Mondays" }),
        show({ malId: 7, title: "Dropped", day: "Tuesdays" }),
      ],
      WED_NOON_JST,
    );

    const all = events(ics);
    expect(all).toHaveLength(1);
    expect(prop(all[0], "SUMMARY")).toBe("Kept");
  });

  it("builds a valid, empty calendar from zero shows", () => {
    const ics = buildAiringCalendar([], WED_NOON_JST);
    const lines = contentLines(ics);

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).not.toContain("BEGIN:VEVENT");
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});

describe("buildAiringCalendar — skipping unplaceable shows", () => {
  it.each([
    ["singular weekday", "Monday", "23:00"],
    ["Jikan's unknown day", "Unknown", "23:00"],
    ["empty day", "", "23:00"],
    ["hour 24", "Mondays", "24:00"],
    ["minute 60", "Mondays", "12:60"],
    ["one-digit minutes", "Mondays", "12:5"],
    ["seconds", "Mondays", "12:00:00"],
    ["three-digit hour", "Mondays", "123:00"],
    ["words", "Mondays", "noon"],
    ["empty time", "Mondays", ""],
  ])("skips a show with %s (%s %s)", (_name, day, time) => {
    const ics = buildAiringCalendar([show({ day, time })], WED_NOON_JST);

    expect(events(ics)).toHaveLength(0);
  });

  it("skips only the invalid shows and keeps the valid ones", () => {
    const ics = buildAiringCalendar(
      [
        show({ malId: 1, day: "Unknown" }),
        show({ malId: 2, day: "Mondays", time: "01:00" }),
        show({ malId: 3, time: "25:00" }),
      ],
      WED_NOON_JST,
    );

    expect(events(ics).map((e) => prop(e, "UID"))).toEqual(["mal-2@anime-maniacs"]);
  });

  it.each([
    ["0:00", "Thursdays", "DTSTART;TZID=Asia/Tokyo:20261015T000000"],
    ["7:05", "Thursdays", "DTSTART;TZID=Asia/Tokyo:20261015T070500"],
    ["23:59", "Wednesdays", "DTSTART;TZID=Asia/Tokyo:20261014T235900"],
  ])("accepts the edge time %s", (time, day, expected) => {
    expect(startOf(day, time, WED_NOON_JST)).toBe(expected);
  });
});

describe("buildAiringCalendar — next JST occurrence", () => {
  // `now` is Wednesday 2026-10-14 12:00:00 JST throughout, unless stated.

  it("starts later today when today's slot hasn't aired yet", () => {
    expect(startOf("Wednesdays", "23:30", WED_NOON_JST)).toBe(
      "DTSTART;TZID=Asia/Tokyo:20261014T233000",
    );
  });

  it("rolls to next week when today's slot already aired", () => {
    expect(startOf("Wednesdays", "09:00", WED_NOON_JST)).toBe(
      "DTSTART;TZID=Asia/Tokyo:20261021T090000",
    );
  });

  it("rolls to next week when the slot is exactly now (strictly after)", () => {
    expect(startOf("Wednesdays", "12:00", WED_NOON_JST)).toBe(
      "DTSTART;TZID=Asia/Tokyo:20261021T120000",
    );
  });

  it("does not roll a slot one minute from now", () => {
    expect(startOf("Wednesdays", "12:01", WED_NOON_JST)).toBe(
      "DTSTART;TZID=Asia/Tokyo:20261014T120100",
    );
  });

  it("rolls when the slot passed seconds ago", () => {
    const now = new Date("2026-10-14T03:00:30Z"); // Wed 12:00:30 JST
    expect(startOf("Wednesdays", "12:00", now)).toBe("DTSTART;TZID=Asia/Tokyo:20261021T120000");
  });

  it.each([
    ["Thursdays", "20261015"],
    ["Fridays", "20261016"],
    ["Saturdays", "20261017"],
    ["Sundays", "20261018"],
    ["Mondays", "20261019"],
    ["Tuesdays", "20261020"],
  ])("maps %s to the right date this week", (day, date) => {
    expect(startOf(day, "10:00", WED_NOON_JST)).toBe(`DTSTART;TZID=Asia/Tokyo:${date}T100000`);
  });

  it("carries across a month and year end", () => {
    const now = new Date("2026-12-30T03:00:00Z"); // Wed 2026-12-30 12:00 JST
    expect(startOf("Mondays", "10:00", now)).toBe("DTSTART;TZID=Asia/Tokyo:20270104T100000");
  });

  describe("across the JST/UTC date boundary", () => {
    // Saturday 20:00 UTC = Sunday 05:00 JST. A weekday read from the UTC clock
    // says "Saturday" here; in Japan it is already Sunday morning.
    const SAT_UTC_SUN_JST = new Date("2026-10-17T20:00:00Z");

    it("places a Sunday-night slot on that same JST Sunday", () => {
      expect(startOf("Sundays", "23:00", SAT_UTC_SUN_JST)).toBe(
        "DTSTART;TZID=Asia/Tokyo:20261018T230000",
      );
    });

    it("rolls a Sunday slot that already aired this JST morning to next week", () => {
      // A UTC-weekday implementation would say "Sunday is tomorrow" → 18th.
      expect(startOf("Sundays", "03:00", SAT_UTC_SUN_JST)).toBe(
        "DTSTART;TZID=Asia/Tokyo:20261025T030000",
      );
    });

    it("treats Saturday as six days away, not as later today", () => {
      // A UTC-weekday implementation would say "Saturday, 23:00 > 20:00" → 17th,
      // an instant that is already in the past.
      expect(startOf("Saturdays", "23:00", SAT_UTC_SUN_JST)).toBe(
        "DTSTART;TZID=Asia/Tokyo:20261024T230000",
      );
    });

    it("handles the Monday 01:00 JST side of the boundary too", () => {
      const now = new Date("2026-10-18T16:00:00Z"); // Sun 16:00 UTC = Mon 01:00 JST
      expect(startOf("Mondays", "00:30", now)).toBe("DTSTART;TZID=Asia/Tokyo:20261026T003000");
      expect(startOf("Mondays", "02:00", now)).toBe("DTSTART;TZID=Asia/Tokyo:20261019T020000");
    });
  });
});

describe("buildAiringCalendar — refresh hints for the subscription feed", () => {
  // The one-time download and the live feed share this builder. Only the feed
  // should tell a calendar app to come back: a downloaded file that claims a
  // refresh interval invites clients to look for a source URL it doesn't have.
  it("emits no refresh hints by default, so the download is unchanged", () => {
    const lines = contentLines(buildAiringCalendar([show()], WED_NOON_JST));

    expect(lines.some((l) => l.startsWith("REFRESH-INTERVAL"))).toBe(false);
    expect(lines.some((l) => l.startsWith("X-PUBLISHED-TTL"))).toBe(false);
  });

  it("emits RFC 7986 REFRESH-INTERVAL and the X-PUBLISHED-TTL alias once each, in the calendar header", () => {
    const lines = contentLines(buildAiringCalendar([show()], WED_NOON_JST, { refreshHours: 6 }));

    expect(lines.filter((l) => l === "REFRESH-INTERVAL;VALUE=DURATION:PT6H")).toHaveLength(1);
    expect(lines.filter((l) => l === "X-PUBLISHED-TTL:PT6H")).toHaveLength(1);
    // Calendar properties, so before the first component.
    const firstComponent = lines.indexOf("BEGIN:VTIMEZONE");
    expect(lines.indexOf("REFRESH-INTERVAL;VALUE=DURATION:PT6H")).toBeLessThan(firstComponent);
    expect(lines.indexOf("X-PUBLISHED-TTL:PT6H")).toBeLessThan(firstComponent);
  });
});
