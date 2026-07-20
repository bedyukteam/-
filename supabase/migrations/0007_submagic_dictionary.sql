-- Brand dictionary for Submagic transcription accuracy (newline/comma separated,
-- parsed to ≤100 terms at reel-creation time).
alter table style_profiles add column if not exists submagic_dictionary text;
