import type { Metadata } from "next";

import { AddFriendForm, FriendRow } from "@/components/social/FriendsManager";
import { getFriendsData } from "@/app/actions/friends";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Friends · anime_maniacs",
  description: "Send and accept friend requests.",
};

/**
 * Friends hub: send requests by username, accept/decline incoming ones, and
 * manage your friends list. Friendship is mutual — a request only becomes a
 * friendship once the other person accepts.
 */
export default async function FriendsPage() {
  await requireUser();
  const data = await getFriendsData();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add friends by username. You become friends once they accept.
        </p>
      </div>

      {!data.available ? (
        <p className="mt-8 rounded-xl bg-card p-4 text-sm text-destructive ring-1 ring-foreground/10">
          Friends aren&apos;t available yet — the friends migration (0020)
          hasn&apos;t been applied to the database.
        </p>
      ) : (
        <>
          <div className="mt-6">
            <AddFriendForm />
          </div>

          {/* Incoming requests — the ones that need action, so they go first. */}
          {data.incoming.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold">
                Friend requests ({data.incoming.length})
              </h2>
              <div className="flex flex-col gap-2">
                {data.incoming.map((f) => (
                  <FriendRow key={f.friendshipId} entry={f} kind="incoming" />
                ))}
              </div>
            </section>
          ) : null}

          {/* Friends */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">
              Your friends ({data.friends.length})
            </h2>
            {data.friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No friends yet — send a request above.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.friends.map((f) => (
                  <FriendRow key={f.friendshipId} entry={f} kind="friend" />
                ))}
              </div>
            )}
          </section>

          {/* Outgoing pending */}
          {data.outgoing.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold">
                Pending requests ({data.outgoing.length})
              </h2>
              <div className="flex flex-col gap-2">
                {data.outgoing.map((f) => (
                  <FriendRow key={f.friendshipId} entry={f} kind="outgoing" />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
