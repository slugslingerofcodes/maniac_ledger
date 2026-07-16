import { vi } from "vitest";

/**
 * A stand-in for the PostgREST query builder.
 *
 * The real builder is fluent (`.from().select().not().order().limit()`) and
 * only executes when awaited, so the mock has to be both chainable and
 * thenable. Every call is recorded on `calls`, which lets tests assert on the
 * query that *would* have been sent — the filters are the behaviour worth
 * pinning (the Hentai exclusion, the sanitized ilike), and they're invisible
 * to a typecheck.
 */
export type BuilderCall = { method: string; args: unknown[] };

export interface QueryBuilderMock {
  calls: BuilderCall[];
  /** Args of the first call to `method`, or undefined if never called. */
  argsOf(method: string): unknown[] | undefined;
  /** True when `method` was called at least once. */
  called(method: string): boolean;
}

/** Builds a thenable, chainable builder resolving to `result`. */
export function queryBuilder(result: { data?: unknown; error?: unknown; count?: number }) {
  const calls: BuilderCall[] = [];

  const builder: Record<string, unknown> = {
    calls,
    argsOf: (method: string) => calls.find((c) => c.method === method)?.args,
    called: (method: string) => calls.some((c) => c.method === method),
    // Awaiting the builder is what runs the query.
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...result }).then(resolve),
  };

  const chainable = [
    "select",
    "not",
    "or",
    "eq",
    "contains",
    "overlaps",
    "order",
    "limit",
    "range",
    "in",
    "gte",
    "lte",
    "ilike",
  ];
  for (const method of chainable) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }

  return builder as Record<string, ReturnType<typeof vi.fn>> & QueryBuilderMock;
}

/** A Supabase client whose `.from()` always returns `builder`. */
export function clientReturning(builder: unknown) {
  return { from: vi.fn(() => builder) };
}
