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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // After any mutation, re-fetch the authoritative state (so we always hold the
  // real friendship id, never a guessed/empty one) and refresh the server view.
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
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
        disabled={pending}
        onClick={() => run(() => removeFriendship(state.friendshipId))}
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
        disabled={pending}
        onClick={() => run(() => removeFriendship(state.friendshipId))}
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
          disabled={pending}
          onClick={() => run(() => acceptFriendRequest(state.friendshipId))}
        >
          <CheckIcon className="mr-1.5 size-3.5" /> Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => removeFriendship(state.friendshipId))}
        >
          <UserXIcon className="mr-1.5 size-3.5" /> Decline
        </Button>
      </div>
    );
  }

  // none
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => run(() => sendFriendRequest(targetUserId))}
    >
      <UserPlusIcon className="mr-1.5 size-3.5" /> Add friend
    </Button>
  );
}
