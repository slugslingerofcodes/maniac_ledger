-- 0029: trigger functions are not an API. Take them off /rest/v1/rpc.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Supabase's default privileges grant EXECUTE on every new function in
-- `public` to PUBLIC, anon and authenticated, which publishes it as an RPC
-- endpoint. For the two SECURITY DEFINER trigger functions that is pure
-- exposure with no caller: nothing in the app invokes them, and Postgres
-- refuses to run a `returns trigger` function outside a trigger anyway. The
-- security advisor flags both (lints 0028/0029), and "harmless because of an
-- unrelated runtime check" is not a state worth keeping.
--
--   touch_last_watched_at()  — 0004, AFTER INSERT on episode_progress
--   handle_new_user()        — 0027, AFTER INSERT on auth.users
--
-- Revoking does not stop the triggers. EXECUTE is checked when a trigger is
-- *created*, not when it fires — verified against the live database before
-- this was applied: a trigger whose function the inserting role could not
-- execute still ran.
--
-- PUBLIC must be in the list: anon and authenticated inherit PUBLIC's grant,
-- so revoking only the named roles leaves them able to call it.
--
-- `create or replace function` keeps existing privileges, so re-running 0004
-- or 0027 later does not undo this. Dropping and recreating either function
-- would — the default privileges would grant EXECUTE again — so re-run this
-- file after any such change.

revoke execute on function public.touch_last_watched_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
