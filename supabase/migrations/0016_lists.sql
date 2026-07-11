-- Custom lists ("Comfort shows", "Best OPs", …).
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- lists: user-owned named collections; `is_public` makes a list viewable by
-- any signed-in user (shared by URL). list_items: ordered members, deduped per
-- list. Catalog rows (anime) are already readable by all authenticated users.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lists enable row level security;

create policy "read own or public lists"
  on public.lists for select
  to authenticated
  using (user_id = auth.uid() or is_public);

create policy "insert own lists"
  on public.lists for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "update own lists"
  on public.lists for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own lists"
  on public.lists for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists lists_user_idx on public.lists (user_id);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  anime_id uuid not null references public.anime (id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  unique (list_id, anime_id)
);

alter table public.list_items enable row level security;

create policy "read items of own or public lists"
  on public.list_items for select
  to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and (l.user_id = auth.uid() or l.is_public)
    )
  );

create policy "modify items of own lists"
  on public.list_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

create policy "update items of own lists"
  on public.list_items for update
  to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

create policy "delete items of own lists"
  on public.list_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

create index if not exists list_items_list_idx on public.list_items (list_id, position);
