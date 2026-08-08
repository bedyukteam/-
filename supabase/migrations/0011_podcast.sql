-- Self-hosted podcast RSS: show-level settings + per-episode audio size.
-- episodes.spotify_published_at (0002) becomes the publish marker; audio_key
-- already holds the full-quality MP3 (audio/{episodeId}.mp3 in R2).

alter table episodes add column if not exists audio_size bigint;

create table if not exists podcast_settings (
  id boolean primary key default true check (id),  -- single-row table
  title text not null default '',
  description text not null default '',
  author text not null default '',
  owner_email text,
  category text not null default 'Society & Culture',
  language text not null default 'he',
  explicit boolean not null default false,
  artwork_key text,   -- key in the PUBLIC R2 bucket (1:1 JPEG, 1400-3000px)
  site_url text,
  updated_at timestamptz not null default now()
);

alter table podcast_settings enable row level security;
drop policy if exists "authenticated full access" on podcast_settings;
create policy "authenticated full access" on podcast_settings
  for all to authenticated using (true) with check (true);
