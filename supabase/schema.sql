-- ============================================================================
-- БОЧКА: Упакуй друга — Схема Supabase (PostgreSQL + Storage)
-- Выполните этот скрипт в SQL Editor вашего проекта Supabase.
-- ============================================================================

create table if not exists public.barrels (
  id text primary key,
  created_at timestamptz not null default now(),
  mode text not null default 'friend' check (mode in ('friend', 'self')),
  message text not null default '',
  photo_url text not null default '',
  frame_style text not null default 'flashlight',
  target_index smallint not null default 0 check (target_index between 0 and 5),
  sender_uid text not null default '',
  sender_tg_id text default null,
  sender_name text not null default '',
  opened_count integer not null default 0,
  survived boolean default null,
  attempts_used smallint default null,
  time_left numeric(5,1) default null,
  replied_cinema boolean not null default false,
  last_opened_at timestamptz default null
);

create index if not exists idx_barrels_sender_uid on public.barrels (sender_uid);

alter table public.barrels enable row level security;

drop policy if exists "Public read barrels" on public.barrels;
create policy "Public read barrels"
  on public.barrels for select
  using (true);

drop policy if exists "Public insert barrels" on public.barrels;
create policy "Public insert barrels"
  on public.barrels for insert
  with check (char_length(id) between 4 and 32 and char_length(message) <= 60);

drop policy if exists "Public update barrel results" on public.barrels;
create policy "Public update barrel results"
  on public.barrels for update
  using (true)
  with check (char_length(message) <= 60);

-- Storage bucket для сжатых 600x600 WebP портретов (< 80 КБ)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barrel-portraits',
  'barrel-portraits',
  true,
  102400,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 102400;

drop policy if exists "Public read barrel portraits" on storage.objects;
create policy "Public read barrel portraits"
  on storage.objects for select
  using (bucket_id = 'barrel-portraits');

drop policy if exists "Public upload barrel portraits" on storage.objects;
create policy "Public upload barrel portraits"
  on storage.objects for insert
  with check (bucket_id = 'barrel-portraits');
