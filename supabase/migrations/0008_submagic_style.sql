-- Caption styling applied at reel creation: a built-in Submagic template name
-- OR the id of a custom theme the user designed in Submagic's editor (theme wins).
alter table style_profiles add column if not exists submagic_template text;
alter table style_profiles add column if not exists submagic_theme_id text;
