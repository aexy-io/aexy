-- Per-surface dashboard layouts.
-- Model: models/dashboard.py (DashboardPreferences.surfaces)
--
-- There is one preferences row per developer (developer_id is UNIQUE), and it
-- carries sidebar state — pinned items, visit counts, chosen persona — as well
-- as the dashboard layout. A second dashboard (the My Work home page) therefore
-- cannot get its own row: every existing sidebar lookup selects by developer_id
-- alone and would start raising MultipleResultsFound.
--
-- So additional surfaces nest inside one JSONB column keyed by surface id:
--   { "my_work": { "preset_type", "visible_widgets", "widget_order", "widget_sizes" } }
-- The existing columns stay exactly what they were — the default ("overview")
-- surface's layout — so every client that never asks for a surface is unaffected.
--
-- Empty by default rather than backfilled: an absent key means "this surface has
-- never been customised", which is what the API turns into the surface's own
-- built-in widget list. Writing a copy of that list for every developer would
-- only freeze today's defaults into rows nobody has touched.

ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS surfaces JSONB NOT NULL DEFAULT '{}'::jsonb;
