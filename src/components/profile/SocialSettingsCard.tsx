"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Users2Icon } from "lucide-react";
import { toast } from "sonner";

import { claimProfile, getMyProfile } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Public-profile settings: claim a handle and toggle visibility. While the
 * profile is private, other users can find the name but never the library.
 */
export function SocialSettingsCard({
  suggestedUsername,
}: {
  suggestedUsername: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (cancelled) return;
      if (p) {
        setUsername(p.username);
        setIsPublic(p.isPublic);
        setClaimed(true);
      } else {
        setUsername(
          suggestedUsername
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .slice(0, 24),
        );
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [suggestedUsername]);

  function save(nextPublic = isPublic) {
    startTransition(async () => {
      const res = await claimProfile(username, nextPublic);
      if (res.ok) {
        setClaimed(true);
        setIsPublic(nextPublic);
        toast.success(
          nextPublic
            ? "Profile is public — share your page!"
            : "Profile saved (private).",
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Users2Icon className="size-3.5" /> Public profile &amp; friends
      </p>

      {!loaded ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="username"
              aria-label="Public username"
              disabled={pending}
              className="h-9"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={pending || username.trim().length < 3}
              onClick={() => save()}
            >
              {claimed ? "Save" : "Claim"}
            </Button>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              disabled={pending || !claimed}
              onChange={(e) => save(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Make my library &amp; activity visible to others
          </label>

          {claimed ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Your page:{" "}
              <Link
                href={`/users/${username}`}
                className="text-foreground underline"
              >
                /users/{username}
              </Link>{" "}
              — follow friends there and see them in your{" "}
              <Link href="/feed" className="text-foreground underline">
                Feed
              </Link>
              .
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Claim a handle to follow friends and (optionally) share your
              library.
            </p>
          )}
        </>
      )}
    </div>
  );
}
