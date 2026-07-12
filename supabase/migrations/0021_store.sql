-- Store: admin-managed products + user purchase requests.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
-- Depends on public.is_admin() (migration 0011).
--
-- products        — catalog items admins add (name, price, image). Any signed-in
--                   user can browse; only admins write.
-- product_requests — a user's "I want this" request against a product. The
--                   requester and admins can read it; admins act on it.
-- Product images live in a public `product-images` storage bucket that only
-- admins can write to.

-- ---------------------------------------------------------------------------
-- 1. products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 2000),
  price       numeric(10, 2) not null check (price >= 0),
  image_url   text,
  available   boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "Anyone signed in can browse products" on public.products;
create policy "Anyone signed in can browse products"
  on public.products for select
  to authenticated
  using (true);

drop policy if exists "Admins insert products" on public.products;
create policy "Admins insert products"
  on public.products for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update products" on public.products;
create policy "Admins update products"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products"
  on public.products for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.products to authenticated;

create index if not exists products_created_idx
  on public.products (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. product_requests
-- ---------------------------------------------------------------------------
create table if not exists public.product_requests (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  note       text check (char_length(note) <= 500),
  status     text not null default 'pending'
             check (status in ('pending', 'fulfilled', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.product_requests enable row level security;

-- A user sees their own requests; admins see every request.
drop policy if exists "Read own or all requests" on public.product_requests;
create policy "Read own or all requests"
  on public.product_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Any signed-in user can request, only as themselves.
drop policy if exists "Users create own requests" on public.product_requests;
create policy "Users create own requests"
  on public.product_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- Admins update status (pending → fulfilled/declined).
drop policy if exists "Admins update requests" on public.product_requests;
create policy "Admins update requests"
  on public.product_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Requester can cancel their own; admins can remove any.
drop policy if exists "Delete own or admin requests" on public.product_requests;
create policy "Delete own or admin requests"
  on public.product_requests for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.product_requests to authenticated;

create index if not exists product_requests_status_idx
  on public.product_requests (status, created_at desc);
create index if not exists product_requests_user_idx
  on public.product_requests (user_id);

-- ---------------------------------------------------------------------------
-- 3. product-images storage bucket (public read, admin-only write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
