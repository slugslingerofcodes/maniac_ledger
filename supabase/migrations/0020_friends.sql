-- Mutual friendships (request → accept), replacing the one-way follow model
-- for the /friends + /feed features. Paste into the Supabase SQL editor → Run.
--
-- A friendship row is created by the requester in 'pending' state; the
-- addressee accepts (status → 'accepted') or the row is deleted (decline /
-- cancel / unfriend). A pair can have at most one row in either direction —
-- the app checks both directions before inserting.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

-- Both parties can see the row (to render requests, friends, counts).
create policy "read own friendships"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Only the requester creates a request, always in 'pending'.
create policy "send friend request"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

-- Only the addressee can accept (pending → accepted). WITH CHECK keeps the
-- addressee from reassigning the row to other users.
create policy "accept friend request"
  on public.friendships for update
  to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either party can remove the row: cancel a sent request, decline an incoming
-- one, or unfriend.
create policy "delete own friendships"
  on public.friendships for delete
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

-- Friends can read each other's progress (the /feed + friend profiles),
-- regardless of the profile's public flag. Additive to the owner-only and
-- public-profile policies from earlier migrations.
create policy "friends can read progress"
  on public.user_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = user_progress.user_id)
          or
          (f.addressee_id = auth.uid() and f.requester_id = user_progress.user_id)
        )
    )
  );
