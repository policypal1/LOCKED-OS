-- Accountability OS Supabase Schema
-- Run this in the Supabase SQL Editor.

create table if not exists public.accountability_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.accountability_state enable row level security;

drop policy if exists "Users can read their own accountability state" on public.accountability_state;
create policy "Users can read their own accountability state"
on public.accountability_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own accountability state" on public.accountability_state;
create policy "Users can insert their own accountability state"
on public.accountability_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own accountability state" on public.accountability_state;
create policy "Users can update their own accountability state"
on public.accountability_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own accountability state" on public.accountability_state;
create policy "Users can delete their own accountability state"
on public.accountability_state
for delete
to authenticated
using (auth.uid() = user_id);
