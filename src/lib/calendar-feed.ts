import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens for the calendar subscription feed (`/api/calendar/feed/<token>.ics`).
 *
 * A calendar app fetches the feed without cookies, so the token in the URL is
 * the whole credential. It is 32 bytes from the CSPRNG — unguessable, so the
 * feed route needs no lockout beyond its per-token rate limit — and only its
 * SHA-256 is stored (migration 0028). Hashing without a salt is fine here:
 * salts defend low-entropy secrets like passwords against precomputation, and
 * a 256-bit random token has nothing to precompute.
 *
 * Server-only (`node:crypto`). The client receives a finished path from the
 * server action and never mints or hashes anything itself.
 */

/** 32 bytes as unpadded base64url is always exactly 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const FEED_PREFIX = "/api/calendar/feed/";

export function generateFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Lowercase hex SHA-256 — the form `calendar_feeds.token_hash` stores. */
export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The site-relative feed URL for a token. The `.ics` suffix is for humans and picky clients. */
export function feedPath(token: string): string {
  return `${FEED_PREFIX}${token}.ics`;
}

/**
 * The token from the feed route's `[token]` segment, or null when it can't be
 * one. Accepts it with or without a single `.ics` suffix. Rejecting malformed
 * input here keeps junk requests from reaching the database at all.
 */
export function parseFeedToken(segment: string): string | null {
  const token = segment.endsWith(".ics") ? segment.slice(0, -".ics".length) : segment;
  return TOKEN_PATTERN.test(token) ? token : null;
}
