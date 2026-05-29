-- =============================================================================
-- 0002_recipe_scaling.sql — per-meal recipe scaling
-- =============================================================================
-- Adds the recipe's canonical yield (`serves`) and an optional manual scale
-- factor (`scale_override`) to meals. The effective scale factor is derived,
-- not stored:
--   factor = scale_override ?? (serves > 0 && headcount ? headcount / serves : 1)
-- Base ingredient quantities are never mutated; scaling is applied on read.
-- =============================================================================

ALTER TABLE meals ADD COLUMN IF NOT EXISTS serves         int;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS scale_override numeric;
