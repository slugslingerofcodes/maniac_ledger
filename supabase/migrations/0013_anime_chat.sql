-- Per-anime discussion chat.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- One room per catalog anime. Any signed-in user can read every room and post
-- as themselves; authors (and admins) can delete their messages. `username` is
-- denormalized at post time — user_metadata isn't queryable across users, and
-- a historical chat log keeping the name used when posting is fine.

create table if not exists public.anime_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  anime_id   uuid not null references public.anime (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade
               default auth.uid(),
  username   text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.anime_chat_messages enable row level security;

drop policy if exists "Chat is readable by all users" on public.anime_chat_messages;
create policy "Chat is readable by all users"
  on public.anime_chat_messages for select
  to authenticated
  using (true);

drop policy if exists "Users post as themselves" on public.anime_chat_messages;
create policy "Users post as themselves"
  on public.anime_chat_messages for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Authors and admins delete messages" on public.anime_chat_messages;
create policy "Authors and admins delete messages"
  on public.anime_chat_messages for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.anime_chat_messages to authenticated;

-- The common read path: a room's messages, newest page first.
create index if not exists anime_chat_messages_room_idx
  on public.anime_chat_messages (anime_id, created_at desc);

-- Live updates: new messages stream to open rooms via Realtime (INSERT events
-- need no replica identity change). Idempotent, mirroring 0006.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'anime_chat_messages'
  ) then
    alter publication supabase_realtime add table public.anime_chat_messages;
  end if;
end $$;
