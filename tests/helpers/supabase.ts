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
    "upsert",
    "update",
    "delete",
    "maybeSingle",
  ];
  for (const method of chainable) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }

  return builder as Record<string, ReturnType<typeof vi.fn>> & QueryBuilderMock;
}

/**
 * What PostgREST answers for an RPC the database doesn't have — e.g. one from a
 * migration that hasn't been applied yet.
 */
export const RPC_NOT_FOUND = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function in the schema cache" },
};

/**
 * A Supabase client whose `.from()` always returns `builder`. `.rpc()` resolves
 * to `rpcResult` — by default "no such function", so code with a pre-migration
 * fallback takes that path unless a test says otherwise.
 */
export function clientReturning(builder: unknown, rpcResult: unknown = RPC_NOT_FOUND) {
  return { from: vi.fn(() => builder), rpc: vi.fn(async () => rpcResult) };
}

type Row = Record<string, unknown>;

/**
 * An in-memory database behind the same fluent, thenable surface, for tests
 * where *which rows come back* is the behaviour under test.
 *
 * `eq` filters are applied; nothing else is. An unfiltered read returns every
 * row in the table — which is exactly what a service-role client does, since
 * it bypasses RLS. So a query that forgets its `user_id` filter returns other
 * users' rows here too, instead of passing because the mock only ever held the
 * right ones. `maybeSingle()` resolves to one row or null, and errors on more
 * than one, as PostgREST does.
 *
 * Each `.from()` gets a fresh builder; `queries[table]` keeps them in call
 * order so tests can assert on the filters that were sent.
 */
export function fakeDb(
  tables: Record<string, Row[]>,
  errors: Record<string, unknown> = {},
) {
  const queries: Record<string, QueryBuilderMock[]> = {};

  const from = vi.fn((table: string) => {
    const calls: BuilderCall[] = [];
    let single = false;

    const builder: Record<string, unknown> = {
      calls,
      argsOf: (method: string) => calls.find((c) => c.method === method)?.args,
      called: (method: string) => calls.some((c) => c.method === method),
      then: (resolve: (v: unknown) => unknown) => {
        if (errors[table]) {
          return Promise.resolve({ data: null, error: errors[table] }).then(resolve);
        }
        const filters = calls.filter((c) => c.method === "eq");
        const rows = (tables[table] ?? []).filter((row) =>
          filters.every(({ args: [column, value] }) => row[column as string] === value),
        );
        if (!single) return Promise.resolve({ data: rows, error: null }).then(resolve);
        if (rows.length > 1) {
          return Promise.resolve({
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned" },
          }).then(resolve);
        }
        return Promise.resolve({ data: rows[0] ?? null, error: null }).then(resolve);
      },
    };

    for (const method of ["select", "eq", "order", "limit"]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => {
      calls.push({ method: "maybeSingle", args: [] });
      single = true;
      return builder;
    });

    (queries[table] ??= []).push(builder as unknown as QueryBuilderMock);
    return builder;
  });

  return { from, queries };
}
