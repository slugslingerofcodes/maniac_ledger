#!/usr/bin/env node
/**
 * Waits for a commit's Vercel preview to be ready and reports its URL — the
 * E2E job's way of finding what to test.
 *
 * The Vercel GitHub app records each finished deployment as a GitHub
 * Deployment on the commit, with the per-deployment URL as `environment_url`
 * (the same build the bot's PR comment links to, minus the branch alias that
 * a later push would move). That is structured data, so this reads it rather
 * than scraping the comment. Deployments are matched to the project by URL:
 * Vercel names them `<project>-<hash>-<scope>.vercel.app`.
 *
 * While no deployment exists yet, the commit's "Vercel" status says whether
 * the build is still going (keep waiting) or has failed (stop now, with its
 * description, instead of timing out twenty minutes later).
 *
 * Also reports whether the preview sits behind Vercel Authentication, so the
 * workflow can skip cleanly when it has no bypass secret.
 *
 *   node scripts/wait-for-vercel-preview.mjs --sha <commit> [--project maniac-ledger] [--timeout 1200]
 *
 * Env: GITHUB_TOKEN (deployments: read, statuses: read), GITHUB_REPOSITORY
 * ("owner/name"). Writes `url=` and `protected=` to $GITHUB_OUTPUT when set,
 * and prints them either way.
 */
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    sha: { type: "string" },
    project: { type: "string", default: "maniac-ledger" },
    timeout: { type: "string", default: "1200" },
    interval: { type: "string", default: "15" },
  },
});

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!values.sha || !repo || !token) {
  console.error("Need --sha, GITHUB_REPOSITORY and GITHUB_TOKEN.");
  process.exit(2);
}
const { sha, project } = values;
const deadline = Date.now() + Number(values.timeout) * 1000;
const intervalMs = Number(values.interval) * 1000;

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const isProjectUrl = (url) => {
  try {
    return new URL(url).hostname.startsWith(`${project}-`);
  } catch {
    return false;
  }
};

/** The ready preview's URL, or null while there isn't one. Throws on a failed build. */
async function check() {
  const deployments = await gh(`/deployments?sha=${sha}&per_page=100`);
  for (const d of deployments) {
    if (d.creator?.login !== "vercel[bot]") continue;
    // Newest status first.
    const [latest] = await gh(`/deployments/${d.id}/statuses?per_page=1`);
    if (!latest || !isProjectUrl(latest.environment_url ?? latest.target_url)) continue;
    if (latest.state === "success") return latest.environment_url;
    if (latest.state === "failure" || latest.state === "error") {
      throw new Error(`Vercel deployment ${latest.state}: ${latest.description ?? ""} ${latest.log_url ?? ""}`);
    }
  }

  // Combined-status entries come newest first; the Vercel app's inspector
  // link carries the project name.
  const statuses = await gh(`/commits/${sha}/statuses?per_page=100`);
  const build = statuses.find(
    (s) => s.context.startsWith("Vercel") && s.target_url?.includes(`/${project}/`),
  );
  if (build && (build.state === "failure" || build.state === "error")) {
    throw new Error(`Vercel build ${build.state}: ${build.description ?? ""} ${build.target_url}`);
  }
  return null;
}

/** True when the deployment answers with Vercel's SSO wall instead of the app. */
async function isProtected(url) {
  const res = await fetch(`${url}/login`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  return res.status === 401 || (res.status >= 300 && res.status < 400 && location.includes("vercel.com/sso"));
}

let url = null;
for (;;) {
  url = await check();
  if (url) break;
  if (Date.now() > deadline) {
    console.error(`No ready ${project} preview for ${sha} after ${values.timeout}s.`);
    process.exit(1);
  }
  console.log(`Waiting for the ${project} preview of ${sha.slice(0, 7)}…`);
  await new Promise((r) => setTimeout(r, intervalMs));
}

const protectedPreview = await isProtected(url);
console.log(`url=${url}`);
console.log(`protected=${protectedPreview}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\nprotected=${protectedPreview}\n`);
}
