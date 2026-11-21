-- Run this once in the Supabase SQL editor for your project.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  name       text   not null check (char_length(name) between 1 and 20),
  score      int    not null check (score between 0 and 100000),
  won        boolean not null default false,
  room       text,
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

-- Anyone may read the leaderboard and add a score; nobody may edit or delete via the API.
create policy "scores are public" on public.scores for select to anon using (true);
create policy "anyone can submit a score" on public.scores for insert to anon with check (true);

create index if not exists scores_score_idx on public.scores (score desc);
