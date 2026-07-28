-- External (Submagic-UI) reel editing: when the user opens a clip in Submagic's
-- own editor we mark it 'editing' and poll GET /projects/{id} for a changed
-- downloadUrl (exports done in Submagic's UI never call our webhook).
-- edit_status values are now: null|'editing'|'exporting'|'exported'|'error'
alter table submagic_clips add column if not exists edit_opened_at timestamptz;
