-- Air-date reminders: one row per (user, upcoming anime) the user asked to be
-- notified about. Paste into the Supabase dashboard → SQL Editor → Run.
-- Safe to re-run.
--
-- `notified_at` stays null until a future sender job (cron/edge function) fires
-- the reminder; this migration only records the user's intent.

create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null
                   references auth.users (id) on delete cascade
                   default auth.uid(),
  mal_id         integer not null,
  anime_title    text not null,
  poster_url     text,
  scheduled_date date,
  notified_at    timestamptz,
  created_at     timestamptz not null default now(),
  -- One reminder per anime per user (toggle = delete the row).
  unique (user_id, mal_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — users only ever see/manage their own reminders.
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notifications" on public.notifications;
create policy "Users can insert their own notifications"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Index for the eventual sender job: pending reminders by date.
-- ---------------------------------------------------------------------------

create index if not exists notifications_pending_idx
  on public.notifications (scheduled_date)
  where notified_at is null;
