"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ClockIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  acceptFriendRequest,
  getFriendStateWith,
  removeFriendship,
  sendFriendRequest,
  type FriendState,
} from "@/app/actions/friends";
import { Button } from "@/components/ui/button";

/**
 * Friend request button on a public profile. Reflects the mutual-friendship
 * state machine: none → send request; outgoing → cancel; incoming →
 * accept/decline; friends → unfriend.
 */
export function FriendButton({
  targetUserId,
  initial,
}: {
  targetUserId: string;
  initial: FriendState;
}) {
  const [state, setState] = useState<FriendState>(initial);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Run a friendship mutation, showing its result immediately.
   *
   * `optimistic` is the state the button jumps to on click. It's deliberately
   * approximate — an outgoing request has no friendship id until the server
   * assigns one — so once the write lands we still re-fetch the authoritative
   * state and replace it, which is what gives later actions a real id to work
   * with. A failure snaps back to where we started.
   */
  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    optimistic: FriendState,
  ) {
    const previous = state;
    setState(optimistic);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setState(previous);
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      setState(await getFriendStateWith(targetUserId));
      router.refresh();
    });
  }

  if (state.state === "self") return null;

  if (state.state === "friends") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          run(() => removeFriendship(state.friendshipId), { state: "none" })
        }
      >
        <UserCheckIcon className="mr-1.5 size-3.5" /> Friends
      </Button>
    );
  }

  if (state.state === "outgoing") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        // An optimistic "Requested" carries no real id yet; cancelling is only
        // possible once the authoritative state arrives a moment later.
        disabled={state.friendshipId === ""}
        onClick={() =>
          run(() => removeFriendship(state.friendshipId), { state: "none" })
        }
      >
        <ClockIcon className="mr-1.5 size-3.5" /> Requested
      </Button>
    );
  }

  if (state.state === "incoming") {
    return (
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            run(() => acceptFriendRequest(state.friendshipId), {
              state: "friends",
              friendshipId: state.friendshipId,
            })
          }
        >
          <CheckIcon className="mr-1.5 size-3.5" /> Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            run(() => removeFriendship(state.friendshipId), { state: "none" })
          }
        >
          <UserXIcon className="mr-1.5 size-3.5" /> Decline
        </Button>
      </div>
    );
  }

  // none — the placeholder id is never used: the button it renders ("Requested")
  // is replaced by the authoritative state before anyone can click it, and a
  // failed send reverts to "none" instead.
  return (
    <Button
      type="button"
      size="sm"
      onClick={() =>
        run(() => sendFriendRequest(targetUserId), {
          state: "outgoing",
          friendshipId: "",
        })
      }
    >
      <UserPlusIcon className="mr-1.5 size-3.5" /> Add friend
    </Button>
  );
}
