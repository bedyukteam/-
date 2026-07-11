-- Phase 2: full-episode video upload (R2) + YouTube publish/schedule
alter table episodes
  add column if not exists video_key text,
  add column if not exists video_size bigint,
  add column if not exists audio_key text,
  add column if not exists youtube_video_id text,
  add column if not exists youtube_status text,
  add column if not exists youtube_error text,
  add column if not exists publish_at timestamptz,
  add column if not exists youtube_upload_url text,
  add column if not exists youtube_uploaded_bytes bigint not null default 0,
  add column if not exists spotify_published_at timestamptz;

-- jobs.stage gains 'extract'; episodes.input_mode gains 'video'.
-- Drop check constraints if the original schema created them (no-op otherwise).
alter table jobs drop constraint if exists jobs_stage_check;
alter table episodes drop constraint if exists episodes_input_mode_check;

create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text unique not null,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table oauth_tokens enable row level security;
drop policy if exists "authenticated full access" on oauth_tokens;
create policy "authenticated full access" on oauth_tokens
  for all to authenticated using (true) with check (true);
