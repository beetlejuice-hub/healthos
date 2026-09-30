-- HealthOS schema. Paste this whole file into Supabase → SQL Editor → Run. Safe to run twice.
--
-- Two tables, both private to the signed-in user (row level security):
--   entries — everything you log (food, drinks, supplements, sets, weight, feelings), one row each
--   docs    — your settings-shaped things: goals, stack, templates, saved foods, workouts…

create table if not exists public.entries (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  kind       text not null,
  at         timestamptz not null,
  data       jsonb not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists entries_sync on public.entries (user_id, updated_at);

create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- The server stamps every write, so "what changed since I last looked" never depends on a
-- phone's clock being right.
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries for each row execute function public.touch();
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch();

alter table public.entries enable row level security;
alter table public.docs enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Make the new tables visible to the API immediately (fixes "Could not find the table … in the schema cache").
notify pgrst, 'reload schema';
