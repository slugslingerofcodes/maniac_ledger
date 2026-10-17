-- 0027: every account gets a username, so username can replace email at login.
--
-- Why this migration is a prerequisite, not a nicety:
--
-- `profiles` rows were only ever created by `claimProfile` — an explicit,
-- opt-in action for publishing a public handle. Signup wrote the chosen name
-- to `auth.users.raw_user_meta_data->>'username'` and nothing else. So the
-- great majority of accounts have a username the app displays but no row
-- anywhere that can be *looked up*, and `raw_user_meta_data` is not queryable
-- by the app (it lives in the auth schema, behind the Auth admin API, with no
-- index on that key).
--
-- Shipping username login without this would lock out every account that never
-- claimed a handle. Run it BEFORE deploying the login change.
--
-- Two halves: backfill what exists, then keep it true for new signups.

-- ---------------------------------------------------------------------------
-- 1. Backfill a profiles row for every existing user.
-- ---------------------------------------------------------------------------
-- `profiles.username` is `^[a-z0-9_]{3,24}$` and UNIQUE, but signup only
-- required 2+ characters and truncated at 32, so stored names can be too
-- short, too long, capitalised, or full of punctuation. Each one is sanitised
-- rather than skipped — a user whose name can't be represented still needs to
-- be able to sign in.
do $$
declare
  u record;
  base text;
  candidate text;
  suffix int;
begin
  for u in
    select id, email, raw_user_meta_data ->> 'username' as meta_username
    from auth.users
    where id not in (select user_id from public.profiles)
    order by created_at
  loop
    -- Prefer the name they chose; fall back to the local part of their email.
    base := lower(coalesce(nullif(trim(u.meta_username), ''), split_part(u.email, '@', 1), ''));
    base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
    base := left(base, 24);
    -- Pad shorts rather than reject them ("jo" -> "jo_").
    while length(base) < 3 loop
      base := base || '_';
    end loop;
    if base !~ '^[a-z0-9_]{3,24}$' then
      base := 'user_' || left(replace(u.id::text, '-', ''), 8);
    end if;

    -- UNIQUE: walk a numeric suffix until the name is free. Truncate the base
    -- so base+suffix still fits in 24 characters.
    candidate := base;
    suffix := 1;
    while exists (select 1 from public.profiles where username = candidate) loop
      suffix := suffix + 1;
      candidate := left(base, 24 - length(suffix::text)) || suffix::text;
    end loop;

    -- is_public stays false: this backfill exists to make login work, and must
    -- not publish anyone's library as a side effect.
    insert into public.profiles (user_id, username, is_public)
    values (u.id, candidate, false)
    on conflict (user_id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Keep it true for every new signup.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the trigger runs as the inserting role, which has
-- no rights on public.profiles. `search_path` is pinned — a SECURITY DEFINER
-- function without it can be hijacked via a caller-controlled search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base text;
  candidate text;
  suffix int;
begin
  base := lower(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                         split_part(new.email, '@', 1), ''));
  base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
  base := left(base, 24);
  while length(base) < 3 loop
    base := base || '_';
  end loop;
  if base !~ '^[a-z0-9_]{3,24}$' then
    base := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  candidate := base;
  suffix := 1;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 24 - length(suffix::text)) || suffix::text;
  end loop;

  insert into public.profiles (user_id, username, is_public)
  values (new.id, candidate, false)
  on conflict (user_id) do nothing;

  return new;
exception
  when others then
    -- Never let profile creation abort the signup itself. A user without a
    -- profiles row can still sign in by email and claim a handle later.
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Case-insensitive lookup at login.
-- ---------------------------------------------------------------------------
-- Usernames are stored lowercase (the CHECK enforces it), and the login action
-- lowercases its input, so this is a plain equality index rather than a
-- functional one.
create index if not exists profiles_username_idx on public.profiles (username);
