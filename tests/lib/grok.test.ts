import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * The Grok (xAI) JSON client.
 *
 * Everything here guards the same distinction, and it is the one a refactor is
 * most likely to flatten: **the retry is for bad output, not for a bad
 * upstream.** Asking a rate-limited endpoint the same question a second time,
 * immediately, spends a second billable call to receive the same 429 — and on
 * this path that happens while a user watches a spinner. Malformed JSON, by
 * contrast, usually does resolve on a blunter second instruction.
 *
 * These branches only run when the model misbehaves or the API is down, so
 * they are close to impossible to exercise by hand and easy to break silently.
 */

const Schema = z.object({ items: z.array(z.string()) });

let fetchMock: ReturnType<typeof vi.fn>;

/** One `choices[0].message.content` body per queued call. */
function stubContents(...contents: string[]) {
  let i = 0;
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: contents[Math.min(i++, contents.length - 1)] } }],
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
}

function stubStatus(status: number, body = "upstream said no") {
  fetchMock = vi.fn(async () => ({
    ok: false,
    status,
    statusText: "err",
    text: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("XAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("grokJson", () => {
  it("returns the parsed object on a clean response", async () => {
    stubContents(JSON.stringify({ items: ["a", "b"] }));
    const { grokJson } = await import("@/lib/grok");

    const out = await grokJson({ system: "s", user: "u", schema: Schema });

    expect(out).toEqual({ items: ["a", "b"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips a markdown fence the model added anyway", async () => {
    // JSON mode is requested, and models still wrap the body in ```json.
    stubContents('```json\n{"items":["a"]}\n```');
    const { grokJson } = await import("@/lib/grok");

    await expect(grokJson({ system: "s", user: "u", schema: Schema })).resolves.toEqual({
      items: ["a"],
    });
  });

  it("retries once with a stricter prompt when the JSON is malformed", async () => {
    stubContents("here you go: {oops", JSON.stringify({ items: ["a"] }));
    const { grokJson } = await import("@/lib/grok");

    const out = await grokJson({ system: "s", user: "u", schema: Schema });

    expect(out).toEqual({ items: ["a"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry must actually change the instruction, or it is just a second
    // roll of the same dice.
    const retryBody = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(retryBody.messages[0].content).toContain("ONLY a single valid JSON object");
  });

  it("retries when the JSON parses but doesn't match the schema", async () => {
    stubContents(JSON.stringify({ items: "not-an-array" }), JSON.stringify({ items: [] }));
    const { grokJson } = await import("@/lib/grok");

    await expect(grokJson({ system: "s", user: "u", schema: Schema })).resolves.toEqual({
      items: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry rather than looping", async () => {
    stubContents("{still broken", "{still broken");
    const { grokJson } = await import("@/lib/grok");

    await expect(grokJson({ system: "s", user: "u", schema: Schema })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a rate-limited upstream", async () => {
    // The point of the whole file: a 429 is not a parsing problem, and a second
    // immediate call just spends another billable request on the same answer.
    stubStatus(429);
    const { grokJson, GrokError } = await import("@/lib/grok");

    await expect(
      grokJson({ system: "s", user: "u", schema: Schema }),
    ).rejects.toBeInstanceOf(GrokError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a server error", async () => {
    stubStatus(503);
    const { grokJson } = await import("@/lib/grok");

    await expect(grokJson({ system: "s", user: "u", schema: Schema })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("carries the status through so callers can branch on it", async () => {
    stubStatus(429);
    const { grokJson, GrokError, isGrokRateLimited } = await import("@/lib/grok");

    const err = await grokJson({ system: "s", user: "u", schema: Schema }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(GrokError);
    expect((err as InstanceType<typeof GrokError>).status).toBe(429);
    expect(isGrokRateLimited(err)).toBe(true);
  });

  it("fails without calling the API when no key is configured", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    stubContents(JSON.stringify({ items: [] }));
    const { grokJson } = await import("@/lib/grok");

    await expect(grokJson({ system: "s", user: "u", schema: Schema })).rejects.toThrow(
      /XAI_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the model from XAI_MODEL when set, and a current default otherwise", async () => {
    stubContents(JSON.stringify({ items: [] }));
    const { grokJson } = await import("@/lib/grok");

    await grokJson({ system: "s", user: "u", schema: Schema });
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    // Not asserting a specific id — that would just pin today's model. What
    // matters is that a retired one isn't hardcoded.
    expect(sent.model).not.toMatch(/^grok-3|^grok-4-fast|^grok-4-0709/);
    expect(sent.response_format).toEqual({ type: "json_object" });
  });

  it("honours XAI_MODEL so a model swap is an env change, not a deploy", async () => {
    vi.stubEnv("XAI_MODEL", "grok-4.5");
    stubContents(JSON.stringify({ items: [] }));
    const { grokJson } = await import("@/lib/grok");

    await grokJson({ system: "s", user: "u", schema: Schema });

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).model).toBe("grok-4.5");
  });
});

describe("isGrokBillingIssue", () => {
  it("separates 'no credits' from a rate limit", async () => {
    // xAI answers a valid key on an unfunded team with 403 permission-denied.
    // It is not a rate limit and not transient: retrying never clears it, and
    // the fix is a billing page, so it must not be reported as either.
    stubStatus(
      403,
      '{"code":"permission-denied","error":"Your newly created team doesn\'t have any credits or licenses yet."}',
    );
    const { grokJson, isGrokBillingIssue, isGrokRateLimited } = await import("@/lib/grok");

    const err = await grokJson({ system: "s", user: "u", schema: Schema }).catch(
      (e: unknown) => e,
    );

    expect(isGrokBillingIssue(err)).toBe(true);
    expect(isGrokRateLimited(err)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not claim a rate limit or a bad key is a billing problem", async () => {
    stubStatus(429, "slow down");
    const { grokJson, isGrokBillingIssue } = await import("@/lib/grok");

    const err = await grokJson({ system: "s", user: "u", schema: Schema }).catch(
      (e: unknown) => e,
    );

    expect(isGrokBillingIssue(err)).toBe(false);
  });
});

describe("isGrokConfigured", () => {
  it("is false when the key is absent, true when present", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const absent = await import("@/lib/grok");
    expect(absent.isGrokConfigured()).toBe(false);

    vi.stubEnv("XAI_API_KEY", "k");
    expect(absent.isGrokConfigured()).toBe(true);
  });
});
