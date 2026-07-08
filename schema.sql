-- C&A Rankings database schema for Supabase
-- Run this once in Supabase → SQL Editor → New query → Run.

create extension if not exists "pgcrypto";

create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('artist', 'mixed')),
  artist_name text,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'ready_to_reveal', 'revealed')),
  created_by text not null default 'avia',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  revealed_at timestamptz
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references public.rankings(id) on delete cascade,
  title text not null,
  artist text,
  spotify_url text,
  import_order int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references public.rankings(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  participant text not null check (participant in ('avia', 'chen')),
  score int not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  unique(song_id, participant)
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references public.rankings(id) on delete cascade,
  participant text not null check (participant in ('avia', 'chen')),
  current_page int not null default 1,
  last_song_id uuid,
  finished boolean not null default false,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ranking_id, participant)
);

create table if not exists public.tie_breaks (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references public.rankings(id) on delete cascade,
  original_average numeric not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tie_break_entries (
  id uuid primary key default gen_random_uuid(),
  tie_break_id uuid not null references public.tie_breaks(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  tie_break_order int,
  unique(tie_break_id, song_id)
);

alter table public.rankings enable row level security;
alter table public.songs enable row level security;
alter table public.ratings enable row level security;
alter table public.progress enable row level security;
alter table public.tie_breaks enable row level security;
alter table public.tie_break_entries enable row level security;

-- This app is intentionally private-by-link for Avia and Chen only.
-- For v1 simplicity, anon access is allowed only to these project tables.
-- Do not store sensitive personal data here.
drop policy if exists "public read rankings" on public.rankings;
drop policy if exists "public insert rankings" on public.rankings;
drop policy if exists "public update rankings" on public.rankings;
create policy "public read rankings" on public.rankings for select using (true);
create policy "public insert rankings" on public.rankings for insert with check (true);
create policy "public update rankings" on public.rankings for update using (true);

drop policy if exists "public read songs" on public.songs;
drop policy if exists "public insert songs" on public.songs;
drop policy if exists "public update songs" on public.songs;
create policy "public read songs" on public.songs for select using (true);
create policy "public insert songs" on public.songs for insert with check (true);
create policy "public update songs" on public.songs for update using (true);

drop policy if exists "public read ratings" on public.ratings;
drop policy if exists "public insert ratings" on public.ratings;
drop policy if exists "public update ratings" on public.ratings;
create policy "public read ratings" on public.ratings for select using (true);
create policy "public insert ratings" on public.ratings for insert with check (true);
create policy "public update ratings" on public.ratings for update using (true);

drop policy if exists "public read progress" on public.progress;
drop policy if exists "public insert progress" on public.progress;
drop policy if exists "public update progress" on public.progress;
create policy "public read progress" on public.progress for select using (true);
create policy "public insert progress" on public.progress for insert with check (true);
create policy "public update progress" on public.progress for update using (true);

drop policy if exists "public read tie_breaks" on public.tie_breaks;
drop policy if exists "public insert tie_breaks" on public.tie_breaks;
drop policy if exists "public update tie_breaks" on public.tie_breaks;
create policy "public read tie_breaks" on public.tie_breaks for select using (true);
create policy "public insert tie_breaks" on public.tie_breaks for insert with check (true);
create policy "public update tie_breaks" on public.tie_breaks for update using (true);

drop policy if exists "public read tie_break_entries" on public.tie_break_entries;
drop policy if exists "public insert tie_break_entries" on public.tie_break_entries;
drop policy if exists "public update tie_break_entries" on public.tie_break_entries;
create policy "public read tie_break_entries" on public.tie_break_entries for select using (true);
create policy "public insert tie_break_entries" on public.tie_break_entries for insert with check (true);
create policy "public update tie_break_entries" on public.tie_break_entries for update using (true);
