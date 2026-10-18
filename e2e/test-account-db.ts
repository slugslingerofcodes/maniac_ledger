import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import { ACCOUNT, SUPABASE } from "./env";

/**
 * Direct database access *as the test account*: anon key + the account's own
 * session, never the service role. RLS therefore confines every read and
 * delete here to the test account's rows, and every query also filters on
 * its `user_id` explicitly — since migration 0015 an unfiltered
 * `user_progress` read returns public profiles' rows too (see CLAUDE.md).
 *
 * Two jobs: check that a UI action actually persisted (not just its
 * optimistic flip), and put the account back the way it was — before a spec
 * runs, in case an earlier run died half-way, and after it, however it ended.
 */
export class TestAccountDb {
  private constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  static async open(): Promise<TestAccountDb> {
    if (!ACCOUNT || !SUPABASE) {
      throw new Error("TestAccountDb needs the test account and Supabase env vars.");
    }
    const db = createClient<Database>(SUPABASE.url, SUPABASE.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.signInWithPassword({
      email: ACCOUNT.email,
      password: ACCOUNT.password,
    });
    if (error || !data.user) {
      throw new Error(`Cleanup client couldn't sign in as the test account: ${error?.message}`);
    }
    return new TestAccountDb(db, data.user.id);
  }

  /** Ends only this client's session; the browser's stays signed in. */
  async close(): Promise<void> {
    await this.db.auth.signOut({ scope: "local" });
  }

  /** Catalog ids for a MAL id (normally one row; the catalog has no unique constraint to promise it). */
  private async animeIds(malId: number): Promise<string[]> {
    const { data, error } = await this.db.from("anime").select("id").eq("mal_id", malId);
    if (error) throw new Error(`anime lookup failed: ${error.message}`);
    return data.map((r) => r.id);
  }

  private async episodeIds(animeIds: string[]): Promise<string[]> {
    if (animeIds.length === 0) return [];
    const { data, error } = await this.db.from("episodes").select("id").in("anime_id", animeIds);
    if (error) throw new Error(`episode lookup failed: ${error.message}`);
    return data.map((r) => r.id);
  }

  /** Whether the title is in the test account's library. */
  async inLibrary(malId: number): Promise<boolean> {
    const animeIds = await this.animeIds(malId);
    if (animeIds.length === 0) return false;
    const { count, error } = await this.db
      .from("user_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", this.userId)
      .in("anime_id", animeIds);
    if (error) throw new Error(`user_progress read failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  /** How many of the title's episodes the test account has ticked. */
  async watchedEpisodes(malId: number): Promise<number> {
    const episodeIds = await this.episodeIds(await this.animeIds(malId));
    if (episodeIds.length === 0) return 0;
    const { count, error } = await this.db
      .from("episode_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", this.userId)
      .in("episode_id", episodeIds);
    if (error) throw new Error(`episode_progress read failed: ${error.message}`);
    return count ?? 0;
  }

  /**
   * Removes every trace of the title from the test account: its ticked
   * episodes and its library entry. The shared catalog rows (`anime`,
   * `episodes`) stay — they're community data, and the app writes them on
   * any visit anyway.
   */
  async purge(malId: number): Promise<void> {
    const animeIds = await this.animeIds(malId);
    if (animeIds.length === 0) return;

    const episodeIds = await this.episodeIds(animeIds);
    if (episodeIds.length > 0) {
      const { error } = await this.db
        .from("episode_progress")
        .delete()
        .eq("user_id", this.userId)
        .in("episode_id", episodeIds);
      if (error) throw new Error(`episode_progress cleanup failed: ${error.message}`);
    }

    const { error } = await this.db
      .from("user_progress")
      .delete()
      .eq("user_id", this.userId)
      .in("anime_id", animeIds);
    if (error) throw new Error(`user_progress cleanup failed: ${error.message}`);
  }
}
