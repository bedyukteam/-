-- studio/supabase/migrations/0004_spotify_stats.sql
-- Spotify has no public API — this stores the latest manually-uploaded CSV snapshot per episode.
-- (Numbered 0004 rather than the plan's 0003 because 0003_cover_templates.sql already exists.)
alter table episodes add column if not exists spotify_stats jsonb;
