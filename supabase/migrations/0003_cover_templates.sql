-- Canva-synced cover backgrounds + their calibrated title position, one row per Canva page.
create table if not exists cover_templates (
  page_number integer primary key,
  storage_path text not null,
  cx integer not null,
  cy integer not null,
  max_w integer not null,
  max_h integer not null,
  side text not null default 'none',
  max_font_px integer not null default 100,
  updated_at timestamptz not null default now()
);
alter table cover_templates enable row level security;
drop policy if exists "authenticated full access" on cover_templates;
create policy "authenticated full access" on cover_templates
  for all to authenticated using (true) with check (true);
