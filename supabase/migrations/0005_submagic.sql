-- Submagic Magic Clips integration: per-episode project tracking + a clips
-- table that powers both the episode card and the global /reels inbox.

alter table episodes add column if not exists submagic_project_id text;
alter table episodes add column if not exists submagic_status text;

create table if not exists submagic_clips (
  id text primary key,                -- Submagic clip UUID
  episode_id uuid not null references episodes(id) on delete cascade,
  title text,
  duration_sec numeric,
  virality_total numeric,
  virality jsonb,
  preview_url text,
  download_url text,
  direct_url text,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists submagic_clips_episode_idx on submagic_clips(episode_id);

alter table submagic_clips enable row level security;
drop policy if exists "authenticated full access" on submagic_clips;
create policy "authenticated full access" on submagic_clips
  for all to authenticated using (true) with check (true);
