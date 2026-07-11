-- Social layer: public profiles + follows + feed visibility.
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- profiles: one row per user who opts into the social features. `username` is
-- the public handle (unique, lowercase); `is_public` gates whether other users
-- can see the profile and its library/progress.
-- follows: follower → followee edges.
--
-- Feed/profile visibility works through ONE extra RLS policy on user_progress:
-- rows become readable by any authenticated user when the owner's profile is
-- public. The owner-only policies from earlier migrations stay in place.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,24}$'),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone signed in can look up profiles (needed to render usernames, search
-- for friends, and resolve /users/[username]). Private profiles are still
-- listed by name — only their library/progress stays hidden.
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own profile"
  on public.profiles for delete
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows enable row level security;

-- Follow edges are visible to anyone signed in (powers follower/following
-- counts on public profiles); only the follower can create/remove their edge.
create policy "follows readable by authenticated"
  on public.follows for select
  to authenticated
  using (true);

create policy "follow as self"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

create policy "unfollow as self"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

create index if not exists follows_followee_idx on public.follows (followee_id);

-- Progress of public profiles is readable by any signed-in user (public
-- profile pages + the activity feed). Additive to the owner-only policy.
create policy "public profiles progress readable"
  on public.user_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = user_progress.user_id and p.is_public
    )
  );

-- Helpful index for feed queries ("latest activity of these users").
create index if not exists user_progress_user_updated_idx
  on public.user_progress (user_id, updated_at desc);
