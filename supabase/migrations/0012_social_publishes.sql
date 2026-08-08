-- Cross-network social publishing (phase B) + external video uploads.
-- One generic table absorbs reels, uploads and (later) rendered designs, for
-- Instagram/Facebook/TikTok publishing and the weekly content calendar.

create table if not exists social_publishes (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('reel','upload','design')),
  source_id text not null,
  platform text not null check (platform in ('instagram','facebook','tiktok')),
  caption text,
  status text not null default 'draft'
    check (status in ('draft','scheduled','publishing','published','error')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_publishes_due_idx on social_publishes(status, scheduled_at);
create index if not exists social_publishes_source_idx on social_publishes(source_type, source_id);

create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  title text,
  r2_key text not null,
  size bigint,
  duration_sec numeric,
  created_at timestamptz not null default now()
);

alter table social_publishes enable row level security;
drop policy if exists "authenticated full access" on social_publishes;
create policy "authenticated full access" on social_publishes
  for all to authenticated using (true) with check (true);

alter table uploads enable row level security;
drop policy if exists "authenticated full access" on uploads;
create policy "authenticated full access" on uploads
  for all to authenticated using (true) with check (true);
