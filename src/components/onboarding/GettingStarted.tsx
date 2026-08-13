import Link from "next/link";
import { ArrowRight, Download, Search, UserRound } from "lucide-react";

import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * First-run guidance, and the app's answer to the question it never used to
 * ask: what should a brand-new account do first?
 *
 * Before this there was no onboarding at all — a new user picked a side and
 * arrived at an empty dashboard with the one feature that fills it (MAL /
 * AniList import) buried at the bottom of `/profile`, four scrolls below the
 * fold on a page they had no reason to open.
 *
 * It needs no dismiss button and stores no "seen" flag: the card is a function
 * of the library being empty, so adding a single anime retires it forever.
 * That's a stronger guarantee than a flag — it can't get stuck on, and it
 * can't reappear for an established user whose localStorage was cleared.
 *
 * Rendered from the (app) layout so it greets people wherever they land,
 * including the newsstand that `/choose` now opens on.
 */
export async function GettingStarted() {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  // `head: true` + limit 1 — we only need "is there anything at all", and this
  // runs on every authed page, so it must not fetch rows.
  const { count, error } = await supabase
    .from("user_progress")
    .select("id", { count: "exact", head: true })
    // Public profiles' progress is readable (migration 0015): without this the
    // card would vanish for a new user the moment anyone else had a library.
    .eq("user_id", user.id)
    .limit(1);

  // A failed probe means we don't know — say nothing rather than greet a
  // long-standing user as if they were new.
  if (error || (count ?? 0) > 0) return null;

  const hasUsername =
    typeof user.user_metadata?.username === "string" &&
    user.user_metadata.username.trim().length > 0;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <h2 className="text-base font-semibold tracking-tight">
          Welcome — let&apos;s fill this in
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your library is empty. Two minutes now and every page in here becomes
          yours.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Step
            href="/profile#import"
            Icon={Download}
            title="Import your history"
            body="Already on MyAnimeList or AniList? Bring it all across in one step."
            primary
          />
          <Step
            href="/search"
            Icon={Search}
            title="Add something you've seen"
            body="Search any title and hit add. Start with a favourite."
          />
          {!hasUsername ? (
            <Step
              href="/profile"
              Icon={UserRound}
              title="Pick a username"
              body="Needed before friends can find you or see your profile."
            />
          ) : (
            <Step
              href="/upcoming"
              Icon={ArrowRight}
              title="Set a reminder"
              body="Tap the bell on anything upcoming and we'll tell you when it airs."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Step({
  href,
  Icon,
  title,
  body,
  primary = false,
}: {
  href: string;
  Icon: typeof Search;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex flex-col gap-1.5 rounded-xl border p-3.5 transition",
        primary
          ? "border-primary/40 bg-background/60 hover:border-primary hover:bg-background"
          : "border-border bg-background/40 hover:border-primary/40 hover:bg-background/70",
      ].join(" ")}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        {title}
        <ArrowRight
          className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {body}
      </span>
    </Link>
  );
}
