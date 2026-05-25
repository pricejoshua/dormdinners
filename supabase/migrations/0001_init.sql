-- =============================================================================
-- 0001_init.sql — Dorm Dinners initial schema
-- =============================================================================
--
-- SECURITY TRADE-OFF: This app has no authentication. RLS is enabled on every
-- table (required by Supabase best-practice), but all policies use
-- `USING (true) WITH CHECK (true)` so both the `anon` and `authenticated`
-- roles can read and write freely. This is intentional: the app is a shared
-- tool for a known dorm group, not a multi-tenant product. If the app ever
-- adds auth, these permissive policies must be replaced with user-scoped ones.
-- =============================================================================

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- pantry_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pantry_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  notes       text,
  updated_by  text,                       -- free text, no auth
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                 -- soft delete; NULL means active
);

ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pantry_items_anon_all"
  ON pantry_items FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "pantry_items_authenticated_all"
  ON pantry_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Partial index: fast queries for active (non-deleted) items
CREATE INDEX idx_pantry_items_active
  ON pantry_items (deleted_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- meals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  week_of     date,                       -- Monday of the active week
  headcount   int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meals_anon_all"
  ON meals FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "meals_authenticated_all"
  ON meals FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_meals_week_of ON meals (week_of);

-- ---------------------------------------------------------------------------
-- meal_ingredients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_ingredients (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id  uuid        REFERENCES meals (id) ON DELETE CASCADE,
  name     text        NOT NULL,
  quantity text,                          -- freeform, e.g. "1.5kg", "2 cans"
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_ingredients_anon_all"
  ON meal_ingredients FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "meal_ingredients_authenticated_all"
  ON meal_ingredients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_meal_ingredients_meal_id ON meal_ingredients (meal_id);

-- ---------------------------------------------------------------------------
-- flipp_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flipp_cache (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_query text,                  -- the search term used
  merchant_name    text,
  item_name        text,
  current_price    numeric,               -- numeric, not float
  post_price_text  text,                  -- unit as returned by Flipp, e.g. "/lb"
  valid_from       timestamptz,
  valid_to         timestamptz,
  fetched_at       timestamptz
);

ALTER TABLE flipp_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flipp_cache_anon_all"
  ON flipp_cache FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "flipp_cache_authenticated_all"
  ON flipp_cache FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_flipp_cache_ingredient_query ON flipp_cache (ingredient_query);
CREATE INDEX idx_flipp_cache_valid_to         ON flipp_cache (valid_to);

-- ---------------------------------------------------------------------------
-- optimization_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimization_suggestions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_ids         uuid[],                -- which meals this suggestion applies to
  suggestion_type  text,                  -- bulk_buy | substitution | overlap | pantry_use
  description      text,
  estimated_saving text,                  -- freeform, e.g. "~$4"
  status           text        NOT NULL DEFAULT 'pending', -- pending | accepted | dismissed
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE optimization_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "optimization_suggestions_anon_all"
  ON optimization_suggestions FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "optimization_suggestions_authenticated_all"
  ON optimization_suggestions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of        date,
  name           text        NOT NULL,
  quantity       text,
  assigned_store text,
  flipp_cache_id uuid        REFERENCES flipp_cache (id),
  pantry_match   boolean     NOT NULL DEFAULT false,
  checked_off    boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_list_items_anon_all"
  ON shopping_list_items FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "shopping_list_items_authenticated_all"
  ON shopping_list_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_shopping_list_items_week_of ON shopping_list_items (week_of);
