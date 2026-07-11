"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Mutual friendships (migration 0020). A request is created pending by the
 * requester; the addressee accepts (→ accepted) or the row is deleted
 * (decline / cancel / unfriend). RLS enforces who may do what; these actions
 * add the app-level rules (no duplicate pair, auto-accept a reverse request).
 */

export type FriendActionResult = { ok: true } | { ok: false; error: string };

const UUID = z.string().uuid();

function friendly(message: string): string {
  if (/relation|does not exist|schema cache|could not find the table/i.test(message)) {
    return "Friends aren't set up on the server yet (migration 0020).";
  }
  if (/duplicate|unique/i.test(message)) return "There's already a request between you.";
  return message;
}

/** The friendship row between the viewer and another user, in either direction. */
async function edgeBetween(meId: string, otherId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${meId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${meId})`,
    )
    .maybeSingle();
  return data ?? null;
}

export type FriendState =
  | { state: "self" }
  | { state: "none" }
  | { state: "outgoing"; friendshipId: string }
  | { state: "incoming"; friendshipId: string }
  | { state: "friends"; friendshipId: string };

/** Relationship between the viewer and `otherUserId`, for the friend button. */
export async function getFriendStateWith(
  otherUserId: string,
): Promise<FriendState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "none" };
  if (user.id === otherUserId) return { state: "self" };

  const edge = await edgeBetween(user.id, otherUserId);
  if (!edge) return { state: "none" };
  if (edge.status === "accepted") {
    return { state: "friends", friendshipId: edge.id };
  }
  return edge.requester_id === user.id
    ? { state: "outgoing", friendshipId: edge.id }
    : { state: "incoming", friendshipId: edge.id };
}

/** Send a friend request to a user by id (used from a profile page). */
export async function sendFriendRequest(
  addresseeId: string,
): Promise<FriendActionResult> {
  if (!UUID.safeParse(addresseeId).success) return { ok: false, error: "Bad user id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (user.id === addresseeId) return { ok: false, error: "That's you!" };

  // If they already sent ME a request, accept it instead of making a dup.
  const existing = await edgeBetween(user.id, addresseeId);
  if (existing) {
    if (existing.status === "accepted") return { ok: true };
    if (existing.addressee_id === user.id) {
      return acceptFriendRequest(existing.id);
    }
    return { ok: true }; // already outgoing pending
  }

  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id: addresseeId, status: "pending" });
  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/friends");
  return { ok: true };
}

/** Send a friend request by username (used from the /friends add box). */
export async function sendFriendRequestByUsername(
  username: string,
): Promise<FriendActionResult> {
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(uname)) {
    return { ok: false, error: "Enter a valid username." };
  }
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", uname)
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!profile) return { ok: false, error: `No user @${uname} found.` };
  return sendFriendRequest(profile.user_id);
}

export async function acceptFriendRequest(
  friendshipId: string,
): Promise<FriendActionResult> {
  if (!UUID.safeParse(friendshipId).success) return { ok: false, error: "Bad id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/friends");
  revalidatePath("/feed");
  return { ok: true };
}

/** Decline an incoming request, cancel a sent one, or unfriend — all a delete. */
export async function removeFriendship(
  friendshipId: string,
): Promise<FriendActionResult> {
  if (!UUID.safeParse(friendshipId).success) return { ok: false, error: "Bad id." };
  const supabase = await createClient();
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/friends");
  revalidatePath("/feed");
  return { ok: true };
}

export type FriendEntry = {
  friendshipId: string;
  userId: string;
  username: string | null;
};

export type FriendsData = {
  available: boolean;
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
};

/** Everything the /friends page needs: friends + incoming/outgoing requests. */
export async function getFriendsData(): Promise<FriendsData> {
  const empty: FriendsData = {
    available: true,
    friends: [],
    incoming: [],
    outgoing: [],
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: rows, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });
  if (error) return { ...empty, available: false };

  // Resolve the "other" user's username for every row.
  const otherIds = [
    ...new Set(
      (rows ?? []).map((r) =>
        r.requester_id === user.id ? r.addressee_id : r.requester_id,
      ),
    ),
  ];
  const nameById = new Map<string, string>();
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", otherIds);
    for (const p of profiles ?? []) nameById.set(p.user_id, p.username);
  }

  const entryOf = (r: {
    id: string;
    requester_id: string;
    addressee_id: string;
  }): FriendEntry => {
    const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
    return {
      friendshipId: r.id,
      userId: otherId,
      username: nameById.get(otherId) ?? null,
    };
  };

  const data: FriendsData = { available: true, friends: [], incoming: [], outgoing: [] };
  for (const r of rows ?? []) {
    if (r.status === "accepted") data.friends.push(entryOf(r));
    else if (r.addressee_id === user.id) data.incoming.push(entryOf(r));
    else data.outgoing.push(entryOf(r));
  }
  return data;
}

/** Accepted-friend user ids — used by the feed to scope activity. */
export async function getFriendIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  return (data ?? []).map((r) =>
    r.requester_id === user.id ? r.addressee_id : r.requester_id,
  );
}
