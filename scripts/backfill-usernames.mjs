// One-time backfill: give every existing user a username.
//
// Sets user_metadata.username = <their email> for any account that doesn't
// already have a username. New signups pick their own username (see
// src/app/auth/actions.ts), so this only touches pre-existing accounts.
//
// Requires the SERVICE ROLE key (bypasses RLS, can read the Auth admin API).
// It is NOT in .env.local by default — grab it from Supabase → Project Settings
// → API, and run:
//
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/backfill-usernames.mjs
//
// or on Windows PowerShell:
//
//   $env:SUPABASE_SERVICE_ROLE_KEY="xxxx"; node scripts/backfill-usernames.mjs
//
// Safe to re-run: users who already have a username are skipped.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Minimal .env.local loader so NEXT_PUBLIC_SUPABASE_URL is picked up locally. */
function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on the ambient environment */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See the header of this file.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let updated = 0;
let skipped = 0;

for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }

  const users = data.users ?? [];
  if (users.length === 0) break;

  for (const user of users) {
    const existing = user.user_metadata?.username;
    if (typeof existing === "string" && existing.trim()) {
      skipped++;
      continue;
    }
    const fallback = user.email ?? "";
    if (!fallback) {
      skipped++;
      continue;
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), username: fallback },
    });
    if (updErr) {
      console.warn(`  ! ${user.id}: ${updErr.message}`);
    } else {
      updated++;
      console.log(`  ✓ ${fallback}`);
    }
  }

  if (users.length < 1000) break;
  page++;
}

console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
