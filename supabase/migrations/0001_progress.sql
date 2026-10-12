-- Player progress, one row per user. The app stores its whole progress document as JSON and
-- merges it client-side (best score per mission, best XP per section, union of streak days).

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint progress_size check (pg_column_size(data) < 200000)
);

alter table public.progress enable row level security;

create policy "Players read their own progress"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "Players create their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "Players update their own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Players delete their own progress"
  on public.progress for delete
  using (auth.uid() = user_id);
