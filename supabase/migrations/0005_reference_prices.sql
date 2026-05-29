-- =============================================================================
-- 0005_reference_prices.sql — group-maintained reference prices
-- =============================================================================
-- One row per (staple, store). Size + unit are human-entered so prices are
-- size-comparable ($/kg, $/L, $/ea) across stores — including Costco, whose
-- warehouse prices aren't available from Flipp. Mirrors the pantry pattern:
-- permissive RLS (no auth), free-text updated_by, soft delete.
-- =============================================================================

CREATE TABLE IF NOT EXISTS reference_prices (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,          -- staple, e.g. "chicken thighs"
  store       text        NOT NULL,          -- e.g. "Costco", "Real Canadian Superstore"
  price       numeric     NOT NULL,          -- pack price
  size_amount numeric,                       -- pack size quantity, e.g. 2
  size_unit   text,                          -- e.g. "kg", "g", "L", "ml", "ea", "pack"
  notes       text,
  updated_by  text,                          -- free text, no auth
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                    -- soft delete; NULL means active
);

ALTER TABLE reference_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_prices_anon_all"
  ON reference_prices FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "reference_prices_authenticated_all"
  ON reference_prices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_reference_prices_active
  ON reference_prices (deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_reference_prices_name ON reference_prices (name);
