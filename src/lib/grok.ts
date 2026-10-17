import { z } from "zod";

/**
 * Minimal xAI (Grok) client for the one thing this app asks a model to do:
 * return a JSON object in a shape we can validate.
 *
 * The API is OpenAI-compatible — `POST https://api.x.ai/v1/chat/completions`
 * with a bearer key — so this is a `fetch` rather than an SDK dependency. That
 * is deliberate: the whole surface used here is one endpoint and four fields,
 * and an SDK would be a package to keep current for no added capability.
 *
 * **Server-only.** `XAI_API_KEY` must never reach the browser, so this module
 * may only be imported from `"use server"` actions or route handlers — never
 * from a Client Component.
 */

const ENDPOINT = "https://api.x.ai/v1/chat/completions";

/**
 * Default model. `grok-4.6` is xAI's current recommendation for chat and code;
 * `grok-3`, `grok-4-fast` and `grok-4-0709` were retired in May 2026 and now
 * redirect. Overridable via `XAI_MODEL` so a model change is an env edit
 * rather than a deploy — this exact class of pin is what kept breaking the
 * Gemini path (1.5 → 2.0 → 2.5, each a 404/429 in production).
 */
const DEFAULT_MODEL = "grok-4.6";

export class GrokError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GrokError";
  }
}

/** Whether the server is configured to call Grok at all. */
export function isGrokConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

/** Strip a ```json fence, which models still emit even in JSON mode. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const CompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullish() }) }))
    .min(1),
});

async function callGrok(
  apiKey: string,
  system: string,
  user: string,
  temperature: number,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || DEFAULT_MODEL,
        temperature,
        // JSON mode requires a top-level *object*, which is why every caller
        // here wraps its list in one rather than asking for a bare array.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      // Without this a hung upstream holds a server action open until the
      // platform's own timeout kills the request with no useful error.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GrokError(`Could not reach Grok: ${msg}`);
  }

  if (!res.ok) {
    // Read the body for the message, but never let a parse failure here mask
    // the status the caller needs to branch on.
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body unreadable — the status is enough */
    }
    throw new GrokError(`Grok returned ${res.status}: ${detail}`, res.status);
  }

  const body = CompletionSchema.parse(await res.json());
  return body.choices[0]!.message.content ?? "";
}

/**
 * Ask Grok for JSON and validate it against `schema`.
 *
 * Retries once, and only when the failure was the model's output rather than
 * the transport: a 429 or a dead socket will not get better for being asked
 * again immediately, while malformed JSON often does with a blunter
 * instruction. Anything else propagates as `GrokError`.
 */
export async function grokJson<T>({
  system,
  user,
  schema,
  temperature = 0.7,
}: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new GrokError("XAI_API_KEY is not configured.");

  const attempt = async (systemPrompt: string) =>
    schema.parse(JSON.parse(stripFences(await callGrok(apiKey, systemPrompt, user, temperature))));

  try {
    return await attempt(system);
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return await attempt(
        `${system}\n\nRespond with ONLY a single valid JSON object and nothing ` +
          `else — no markdown fence, no prose, no trailing commentary.`,
      );
    }
    throw err;
  }
}

/**
 * True when xAI authenticated the key but refused the work — in practice, a
 * team with no credits or licenses (`403 permission-denied`).
 *
 * Worth its own branch because it is the one failure here that retrying can
 * never fix and the user *can*: it means the key is correct and the account
 * needs topping up. Folded into the generic error it reads as "the feature is
 * broken", which sends people to the code instead of the billing page.
 */
export function isGrokBillingIssue(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof GrokError && err.status === 403) return true;
  return /permission-denied|credits?\b|licen[sc]e/i.test(msg);
}

/** True when the failure is one the user should be told to retry later. */
export function isGrokRateLimited(err: unknown): boolean {
  if (err instanceof GrokError) {
    if (err.status === 429) return true;
    if (err.status != null && err.status >= 500) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|quota|exhausted|overloaded/i.test(msg);
}
