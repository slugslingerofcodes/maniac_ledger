import { JST_DAYS, JST_OFFSET_MS } from "@/lib/jst";

/**
 * Pure iCalendar (RFC 5545) builder for the "Add to calendar" download. No I/O
 * and no clock reads — `now` is an argument, so the output is deterministic
 * and the route stays the only place that knows what time it is.
 */

/** One weekly broadcast slot. `day` is Jikan's plural weekday, `time` is JST. */
export type AiringShow = {
  malId: number;
  title: string;
  day: string;
  time: string;
};

/** RFC 5545 caps a physical line at 75 octets, CRLF excluded. */
const MAX_LINE_OCTETS = 75;

/**
 * RFC 5545 §3.3.11 TEXT escaping. Backslash goes first, otherwise the
 * backslashes the later replacements insert would be doubled.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** UTF-8 byte length of one code point (a lone surrogate encodes as U+FFFD). */
function utf8Length(char: string): number {
  const cp = char.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * RFC 5545 §3.1 line folding. The limit is octets, not JS chars — a title in
 * Japanese is 3 bytes per character, so counting `.length` would emit lines
 * strict parsers reject. Iterating with `for…of` walks code points, so a
 * surrogate pair (or any multi-byte character) is never split across a fold.
 * The leading space of a continuation line counts toward its 75.
 */
export function foldIcsLine(line: string): string {
  const lines: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > MAX_LINE_OCTETS) {
      lines.push(current);
      current = ` ${char}`;
      octets = 1 + size;
    } else {
      current += char;
      octets += size;
    }
  }
  lines.push(current);
  return lines.join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYYMMDDTHHMMSS` from a Date's UTC fields. */
function formatUtcFields(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * Parses a Jikan slot into weekday index + time, or null when either half is
 * unusable. Stricter than `nextBroadcastMs` on purpose: a "25:00" slot would
 * silently roll into the next day there, but here it would become a recurring
 * event in someone's calendar, so it is dropped instead.
 */
function parseSlot(
  day: string,
  time: string,
): { dow: number; hours: number; minutes: number } | null {
  const dow = (JST_DAYS as readonly string[]).indexOf(day);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (dow === -1 || !m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { dow, hours, minutes };
}

/**
 * The first instant of the slot strictly after `now`, as a Date whose UTC
 * fields read as JST wall-clock. Same math as `nextBroadcastMs` in
 * `src/lib/jst.ts`, which can't be reused because it reads the real clock.
 */
function nextOccurrenceJst(
  slot: { dow: number; hours: number; minutes: number },
  now: Date,
): Date {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const candidate = new Date(jstNow);
  candidate.setUTCDate(
    candidate.getUTCDate() + ((slot.dow - jstNow.getUTCDay() + 7) % 7),
  );
  candidate.setUTCHours(slot.hours, slot.minutes, 0, 0);
  if (candidate.getTime() <= jstNow.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}

/**
 * A VCALENDAR with one weekly VEVENT per valid show, in input order. Events
 * are pinned to an Asia/Tokyo VTIMEZONE (JST has no DST, so a single STANDARD
 * component is the whole zone) and the calendar app converts to local time.
 * Shows with an unparseable slot are skipped; for a repeated `malId` the first
 * emitted event wins, keeping UIDs unique.
 */
export function buildAiringCalendar(shows: AiringShow[], now: Date): string {
  const dtstamp = `${formatUtcFields(now)}Z`;

  const lines = [
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
  ];

  const emitted = new Set<number>();
  for (const show of shows) {
    if (emitted.has(show.malId)) continue;
    const slot = parseSlot(show.day, show.time);
    if (!slot) continue;
    emitted.add(show.malId);

    lines.push(
      "BEGIN:VEVENT",
      `UID:mal-${show.malId}@anime-maniacs`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Tokyo:${formatUtcFields(nextOccurrenceJst(slot, now))}`,
      "DURATION:PT30M",
      "RRULE:FREQ=WEEKLY",
      `SUMMARY:${escapeIcsText(show.title)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
