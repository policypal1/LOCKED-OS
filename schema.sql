-- LOCKED OS - Supabase setup
-- Run this entire file once in the Supabase SQL Editor.

create table if not exists public.locked_os_state_v2 (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.locked_os_state_v2
  drop constraint if exists locked_os_single_row;

alter table public.locked_os_state_v2
  add constraint locked_os_single_row
  check (id = 'samuel-main');

alter table public.locked_os_state_v2 enable row level security;

grant select, insert, update
on table public.locked_os_state_v2
to anon, authenticated;

drop policy if exists "Locked OS can read state" on public.locked_os_state_v2;
drop policy if exists "Locked OS can create state" on public.locked_os_state_v2;
drop policy if exists "Locked OS can update state" on public.locked_os_state_v2;

create policy "Locked OS can read state"
on public.locked_os_state_v2
for select
to anon, authenticated
using (id = 'samuel-main');

create policy "Locked OS can create state"
on public.locked_os_state_v2
for insert
to anon, authenticated
with check (id = 'samuel-main');

create policy "Locked OS can update state"
on public.locked_os_state_v2
for update
to anon, authenticated
using (id = 'samuel-main')
with check (id = 'samuel-main');

insert into public.locked_os_state_v2 (id, state, updated_at)
values ('samuel-main', '{}'::jsonb, now())
on conflict (id) do nothing;
