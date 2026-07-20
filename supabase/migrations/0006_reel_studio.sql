-- Reel Studio: per-clip YouTube metadata + publish state + edit-rerender state.
-- The webhook/refresh upsert (mapWebhookClips) never touches these columns,
-- so refreshes won't clobber user edits or publish status.

alter table submagic_clips add column if not exists yt_title text;
alter table submagic_clips add column if not exists yt_description text;
alter table submagic_clips add column if not exists yt_video_id text;
alter table submagic_clips add column if not exists yt_status text;      -- null|'uploading'|'published'|'scheduled'|'error'
alter table submagic_clips add column if not exists yt_error text;
alter table submagic_clips add column if not exists yt_publish_at timestamptz;
alter table submagic_clips add column if not exists edit_status text;    -- null|'exporting'|'exported'|'error'
