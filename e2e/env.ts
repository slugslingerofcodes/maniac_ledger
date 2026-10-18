import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Everything the E2E suite reads from the environment, in one place: a spec
 * decides whether it can run by checking a constant here, never by reading
 * `process.env` itself.
 *
 * Local runs pick up `.env.local` — the file the dev server already reads, and
 * where the test account's credentials go. Variables already set in the
 * environment win (Node's `loadEnvFile` never overrides), which is how CI
 * passes its secrets.
 */
const envFile = path.join(__dirname, "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * The app under test. Unset → the local dev server, which Playwright starts
 * (or reuses, if `npm run dev` is already up). CI sets it to the PR's Vercel
 * preview.
 */
export const BASE_URL = (env("E2E_BASE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
export const STARTS_DEV_SERVER = env("E2E_BASE_URL") == null;

/**
 * The dedicated test account. Never a real person's: the suite writes to its
 * library on the live database. Signing in uses the username when one is
 * given (that path needs the deployment's service-role key) and the email
 * otherwise; the cleanup client always needs the email.
 */
const email = env("E2E_EMAIL");
const password = env("E2E_PASSWORD");
export const ACCOUNT =
  email && password
    ? { email, password, identifier: env("E2E_USERNAME") ?? email }
    : null;

/**
 * Supabase, for cleanup only — the specs that write delete their rows through
 * the test account's own session, so RLS confines them to that account. The
 * CI build's placeholder URL counts as absent.
 */
const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE =
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder.supabase.co")
    ? { url: supabaseUrl, anonKey: supabaseAnonKey }
    : null;

/**
 * Vercel's "Protection Bypass for Automation" secret. Preview deployments sit
 * behind Vercel Authentication; without this a headless browser only ever
 * sees Vercel's sign-in page.
 */
export const VERCEL_BYPASS_SECRET = env("VERCEL_AUTOMATION_BYPASS_SECRET");

export const SKIP_NO_ACCOUNT =
  "E2E_EMAIL / E2E_PASSWORD are not set: the signed-in flows need the dedicated test account (DEPLOY.md, step 7).";
export const SKIP_NO_CLEANUP =
  "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set: this spec writes to the live database and won't run without a way to clean up after itself.";

/** Browser state saved by the setup projects (gitignored). */
export const ANON_STATE = path.join(__dirname, ".auth", "anon.json");
export const USER_STATE = path.join(__dirname, ".auth", "user.json");

/**
 * The titles the suite writes against. Each has the same English and romaji
 * title, so the assertions hold whichever title language the account prefers,
 * and they are different titles so the two writing spec files never touch
 * each other's rows when they run in parallel.
 */
export const LIBRARY_ANIME = { malId: 1, title: "Cowboy Bebop" } as const;
export const EPISODE_ANIME = { malId: 6, title: "Trigun" } as const;
