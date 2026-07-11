"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { followUser, unfollowUser } from "@/app/actions/social";
import { Button } from "@/components/ui/button";

export function FollowButton({
  followeeId,
  initialFollowing,
}: {
  followeeId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const res = following
        ? await unfollowUser(followeeId)
        : await followUser(followeeId);
      if (res.ok) {
        setFollowing(!following);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={following ? "outline" : "default"}
      disabled={pending}
      onClick={toggle}
    >
      {following ? (
        <>
          <UserMinusIcon className="mr-1.5 size-3.5" /> Unfollow
        </>
      ) : (
        <>
          <UserPlusIcon className="mr-1.5 size-3.5" /> Follow
        </>
      )}
    </Button>
  );
}
