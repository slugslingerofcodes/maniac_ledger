import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { toNavUser } from "@/lib/nav-user";

/**
 * The header's view of the signed-in user, now derived on the server from the
 * verified `getUser()` instead of fetched in the browser. These pin the
 * fields the header used to compute inline, so moving the derivation across
 * the network boundary didn't change what anyone sees.
 */

const user = (over: Partial<User>): User =>
  ({
    id: "u1",
    email: "rin@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as User;

describe("toNavUser", () => {
  it("is null when signed out", () => {
    expect(toNavUser(null)).toBeNull();
  });

  it("prefers the chosen username for the name and the profile link", () => {
    expect(toNavUser(user({ user_metadata: { username: "rin" } }))).toMatchObject({
      name: "rin",
      username: "rin",
      email: "rin@example.com",
    });
  });

  it("falls back to the email's local part, with no profile link", () => {
    expect(toNavUser(user({}))).toMatchObject({ name: "rin", username: null });
  });

  it("only takes a string avatar URL", () => {
    expect(toNavUser(user({ user_metadata: { avatar_url: "https://a/b.png" } }))?.avatarUrl).toBe(
      "https://a/b.png",
    );
    expect(toNavUser(user({ user_metadata: { avatar_url: 42 } }))?.avatarUrl).toBeNull();
  });

  it("flags admins only on an exact `true` in app_metadata", () => {
    expect(toNavUser(user({ app_metadata: { is_admin: true } }))?.isAdmin).toBe(true);
    // user_metadata is user-writable — it must never grant the admin link.
    expect(toNavUser(user({ user_metadata: { is_admin: true } }))?.isAdmin).toBe(false);
    expect(toNavUser(user({ app_metadata: { is_admin: "true" } }))?.isAdmin).toBe(false);
  });
});
