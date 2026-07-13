-- Private library entries: anime added from the "miscellaneous" (adult) tab is
-- never shared — not on the feed, not on public profiles, not with friends.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Mechanism: a `user_progress.is_private` flag, and the two *sharing* RLS
-- policies (public-profile readers from 0015, friend readers from 0020) are
-- recreated to exclude private rows. The owner-only policies are untouched, so
-- users always see their own private entries.

alter table public.user_progress
  add column if not exists is_private boolean not null default false;

do $$
begin
  -- 0015: progress of public profiles is readable by any signed-in user.
  if to_regclass('public.profiles') is not null then
    drop policy if exists "public profiles progress readable" on public.user_progress;
    create policy "public profiles progress readable"
      on public.user_progress for select
      to authenticated
      using (
        not user_progress.is_private
        and exists (
          select 1 from public.profiles p
          where p.user_id = user_progress.user_id and p.is_public
        )
      );
  end if;

  -- 0020: accepted friends can read each other's progress.
  if to_regclass('public.friendships') is not null then
    drop policy if exists "friends can read progress" on public.user_progress;
    create policy "friends can read progress"
      on public.user_progress for select
      to authenticated
      using (
        not user_progress.is_private
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (
              (f.requester_id = auth.uid() and f.addressee_id = user_progress.user_id)
              or
              (f.addressee_id = auth.uid() and f.requester_id = user_progress.user_id)
            )
        )
      );
  end if;
end
$$;
