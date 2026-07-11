"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  acceptFriendRequest,
  removeFriendship,
  sendFriendRequestByUsername,
  type FriendEntry,
} from "@/app/actions/friends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Send a friend request by username. */
export function AddFriendForm() {
  const [username, setUsername] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const uname = username.trim();
    if (uname.length < 3) return;
    startTransition(async () => {
      const res = await sendFriendRequestByUsername(uname);
      if (res.ok) {
        toast.success(`Friend request sent to @${uname.toLowerCase()}.`);
        setUsername("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        placeholder="Add a friend by username"
        aria-label="Friend username"
        disabled={pending}
        className="h-9"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button
        type="button"
        size="sm"
        className="h-9 shrink-0"
        disabled={pending || username.trim().length < 3}
        onClick={submit}
      >
        <UserPlusIcon className="mr-1.5 size-3.5" /> Send
      </Button>
    </div>
  );
}

/** One row in the friends / requests lists, with the actions for its kind. */
export function FriendRow({
  entry,
  kind,
}: {
  entry: FriendEntry;
  kind: "friend" | "incoming" | "outgoing";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [gone, setGone] = useState(false);

  function act(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setGone(true);
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  if (gone) return null;

  const label = entry.username ? `@${entry.username}` : "A user";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      {entry.username ? (
        <Link
          href={`/users/${entry.username}`}
          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
        >
          {label}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
          {label}{" "}
          <span className="text-xs">(no public username)</span>
        </span>
      )}

      {kind === "incoming" ? (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              act(() => acceptFriendRequest(entry.friendshipId), "Friend added.")
            }
          >
            <CheckIcon className="mr-1.5 size-3.5" /> Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              act(() => removeFriendship(entry.friendshipId), "Request declined.")
            }
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={pending}
          onClick={() =>
            act(
              () => removeFriendship(entry.friendshipId),
              kind === "friend" ? "Friend removed." : "Request cancelled.",
            )
          }
        >
          {kind === "friend" ? "Unfriend" : "Cancel"}
        </Button>
      )}
    </div>
  );
}
